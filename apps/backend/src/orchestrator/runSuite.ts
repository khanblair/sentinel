import type { PrismaClient, Run as PrismaRun, StepLog as PrismaStepLog, TestCase } from "@prisma/client";
import type { Run, RunMode, ServerMessage, StepLog, StepVerdict } from "@sentinel/shared";
import { estimateCostUsd } from "../analytics/cost.js";
import { generateChecklistFromTestCase } from "../checklistGenerator/index.js";
import { NotFoundError } from "../errors.js";
import { runStep, type StepResult } from "../executionLoop/actionLoop.js";
import type { ConfirmationResolver } from "../executionLoop/confirmation.js";
import { generateRunInsights } from "../metacognition/insights.js";
import { alwaysContinueResolver, shouldOfferEarlyStop, type RunPauseResolver } from "../metacognition/runPause.js";
import type { ProviderAdapter, TokenUsage } from "../providers/types.js";
import type { PageFactory } from "../automation/page.js";

export interface RunSuiteOptions {
  prisma: PrismaClient;
  suiteId: string;
  assistantId: string;
  environmentId?: string | null;
  mode: RunMode;
  provider: ProviderAdapter;
  pageFactory: PageFactory;
  resolveConfirmation: ConfirmationResolver;
  /** Called once per persisted Run/StepLog change — the live step-by-step ticker
   * (design §4.3) subscribes to exactly these two message types over WebSocket. */
  broadcast: (message: ServerMessage) => void;
  /** Lets a caller pre-generate the Run's id (e.g. to build an interactive
   * ConfirmationResolver bound to this run before runSuite creates the row). Falls
   * back to Prisma's default cuid() generation when omitted. */
  runId?: string;
  /** Only consulted in Interactive mode, and only at the design §6.4 checkpoint.
   * Defaults to alwaysContinueResolver, matching Full-Auto's "never pause" rule —
   * pass a WS-backed resolver to actually ask a tester. */
  resolveRunPause?: RunPauseResolver;
  /** "manual" (a tester clicked Run Suite) or "scheduled" (the scheduler fired a
   * ScheduledJob) — feeds Analytics' manual-vs-scheduled split (§5.10). */
  trigger?: Run["trigger"];
}

const VERDICT_SEVERITY: Record<StepVerdict, number> = { pass: 0, blocked: 1, fail: 2 };

function worstVerdict(a: StepVerdict, b: StepVerdict): StepVerdict {
  return VERDICT_SEVERITY[b] > VERDICT_SEVERITY[a] ? b : a;
}

function verdictToRunStatus(verdict: StepVerdict): Run["status"] {
  switch (verdict) {
    case "pass":
      return "passed";
    case "fail":
      return "failed";
    case "blocked":
      return "blocked";
    default: {
      const exhaustive: never = verdict;
      throw new Error(`Unhandled verdict: ${String(exhaustive)}`);
    }
  }
}

function serializeRun(run: PrismaRun): Run {
  return {
    id: run.id,
    suiteId: run.suiteId,
    assistantId: run.assistantId,
    environmentId: run.environmentId,
    mode: run.mode as RunMode,
    trigger: run.trigger as Run["trigger"],
    status: run.status as Run["status"],
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
  };
}

function serializeStepLog(step: PrismaStepLog): StepLog {
  return {
    id: step.id,
    runId: step.runId,
    testCaseId: step.testCaseId,
    stepIndex: step.stepIndex,
    toolCall: JSON.parse(step.toolCall) as Record<string, unknown>,
    observation: step.observation,
    verdict: step.verdict as StepVerdict,
    confidence: step.confidence,
    confidenceReason: step.confidenceReason,
    createdAt: step.createdAt.toISOString(),
  };
}

async function recordUsage(
  prisma: PrismaClient,
  runId: string,
  provider: ProviderAdapter,
  usage: TokenUsage,
): Promise<void> {
  if (usage.promptTokens === 0 && usage.completionTokens === 0) {
    return;
  }
  await prisma.providerUsage.create({
    data: {
      runId,
      provider: provider.provider,
      model: provider.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      estimatedCostUsd: estimateCostUsd(provider.model, usage.promptTokens, usage.completionTokens),
    },
  });
}

interface ExecuteTestCaseParams {
  prisma: PrismaClient;
  runId: string;
  provider: ProviderAdapter;
  pageFactory: PageFactory;
  resolveConfirmation: ConfirmationResolver;
  broadcast: (message: ServerMessage) => void;
  testCase: TestCase;
  baseUrl: string;
  /** Shared across every test case in the run so StepLog.stepIndex is unique per Run. */
  stepIndexCounter: { value: number };
}

/** One Test Case's checklist, start to finish: generate it, run each step, persist
 * a StepLog + broadcast it, stop at the first non-pass step. Pulled out of runSuite
 * to keep that function's branching (Insights, run-level pause) readable. */
async function executeTestCase(params: ExecuteTestCaseParams): Promise<StepVerdict> {
  const { prisma, runId, provider, pageFactory, resolveConfirmation, broadcast, testCase, baseUrl, stepIndexCounter } =
    params;

  const checklist = await generateChecklistFromTestCase({
    provider,
    urlPath: testCase.urlPath,
    steps: testCase.steps,
    expectedResult: testCase.expectedResult,
  });
  await recordUsage(prisma, runId, provider, checklist.usage);

  const page = await pageFactory.getPage(`${baseUrl}${testCase.urlPath}`);

  let caseVerdict: StepVerdict = "pass";
  for (const instruction of checklist.steps) {
    const result: StepResult = await runStep({ instruction, page, provider, resolveConfirmation });
    await recordUsage(prisma, runId, provider, result.usage);

    const stepLog = await prisma.stepLog.create({
      data: {
        runId,
        testCaseId: testCase.id,
        stepIndex: stepIndexCounter.value++,
        toolCall: JSON.stringify({ turns: result.turns }),
        observation: result.turns.at(-1)?.observation ?? "",
        verdict: result.verdict,
        confidence: result.confidence,
        confidenceReason: result.confidenceReason,
      },
    });
    broadcast({ type: "run:step", runId, step: serializeStepLog(stepLog) });

    caseVerdict = worstVerdict(caseVerdict, result.verdict);
    if (result.verdict !== "pass") {
      break;
    }
  }
  return caseVerdict;
}

/** True to keep going. Only actually asks (via resolveRunPause) at the design §6.4
 * checkpoint; otherwise a no-op that always continues. */
async function shouldContinueRun(
  resolveRunPause: RunPauseResolver,
  caseVerdicts: readonly StepVerdict[],
): Promise<boolean> {
  if (!shouldOfferEarlyStop(caseVerdicts)) {
    return true;
  }
  const nonPassCount = caseVerdicts.filter((v) => v !== "pass").length;
  return resolveRunPause(
    `Something looks fundamentally wrong here: the first ${caseVerdicts.length} cases all failed or were ` +
      `blocked (${nonPassCount}/${caseVerdicts.length} non-pass). Continue anyway, or stop and look?`,
  );
}

/**
 * Runs every active Test Case in a Suite through checklist generation and the action
 * loop, persisting a Run + one StepLog per checklist step (plus ProviderUsage per AI
 * call), and broadcasting Run/StepLog changes over WebSocket for the live ticker. A
 * test case stops at its first non-pass step (matches Testify's per-case
 * short-circuit); the Suite's overall verdict is the worst verdict across all cases.
 * After finishing, an automatic Insights pass (§6.3) summarizes the run, and — in
 * Interactive mode only — an early, visibly-systemic failure pattern offers to pause
 * the whole run (§6.4) instead of grinding through it.
 */
export async function runSuite(options: RunSuiteOptions): Promise<Run> {
  const {
    prisma,
    suiteId,
    assistantId,
    environmentId,
    mode,
    provider,
    pageFactory,
    resolveConfirmation,
    broadcast,
    runId,
    trigger = "manual",
  } = options;
  const resolveRunPause = mode === "interactive" ? (options.resolveRunPause ?? alwaysContinueResolver) : null;

  const suite = await prisma.suite.findUnique({ where: { id: suiteId } });
  if (!suite) {
    throw new NotFoundError(`Suite ${suiteId} not found`);
  }

  const environment = environmentId
    ? await prisma.environment.findUnique({ where: { id: environmentId } })
    : null;
  const baseUrl = environment?.baseUrl ?? "";

  const run = await prisma.run.create({
    data: {
      ...(runId ? { id: runId } : {}),
      suiteId,
      assistantId,
      environmentId: environmentId ?? null,
      mode,
      trigger,
      status: "running",
    },
  });
  broadcast({ type: "run:update", run: serializeRun(run) });

  try {
    const testCases = await prisma.testCase.findMany({
      where: { suiteId, archivedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    let overallVerdict: StepVerdict = "pass";
    const stepIndexCounter = { value: 0 };
    const caseVerdicts: StepVerdict[] = [];
    let pausedEarly = false;

    for (const testCase of testCases) {
      const caseVerdict = await executeTestCase({
        prisma,
        runId: run.id,
        provider,
        pageFactory,
        resolveConfirmation,
        broadcast,
        testCase,
        baseUrl,
        stepIndexCounter,
      });
      overallVerdict = worstVerdict(overallVerdict, caseVerdict);
      caseVerdicts.push(caseVerdict);

      if (resolveRunPause && !(await shouldContinueRun(resolveRunPause, caseVerdicts))) {
        pausedEarly = true;
        break;
      }
    }

    const allStepLogs = await prisma.stepLog.findMany({ where: { runId: run.id } });
    const insights =
      generateRunInsights(allStepLogs.map((s) => ({ verdict: s.verdict as StepVerdict, confidenceReason: s.confidenceReason }))) +
      (pausedEarly ? " Run stopped early by the tester after an early systemic-looking failure pattern." : "");

    const finished = await prisma.run.update({
      where: { id: run.id },
      data: {
        status: pausedEarly ? "blocked" : verdictToRunStatus(overallVerdict),
        finishedAt: new Date(),
        insights,
      },
    });
    broadcast({ type: "run:update", run: serializeRun(finished) });
    return serializeRun(finished);
  } catch (error) {
    const failed = await prisma.run.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date() },
    });
    broadcast({ type: "run:update", run: serializeRun(failed) });
    throw error;
  } finally {
    await pageFactory.close();
  }
}
