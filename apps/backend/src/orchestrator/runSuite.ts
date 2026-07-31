import type { PrismaClient, TestCase } from "@prisma/client";
import type { Run, RunMode, ServerMessage, StepVerdict } from "@sentinel/shared";
import { generateChecklistFromTestCase } from "../checklistGenerator/index.js";
import { RuleRepository } from "../db/repositories/ruleRepository.js";
import { NotFoundError } from "../errors.js";
import type { ConfirmationResolver } from "../executionLoop/confirmation.js";
import { generateRunInsights } from "../metacognition/insights.js";
import { alwaysContinueResolver, shouldOfferEarlyStop, type RunPauseResolver } from "../metacognition/runPause.js";
import type { ProviderAdapter } from "../providers/types.js";
import type { PageFactory } from "../automation/page.js";
import { runChecklistSteps } from "./runChecklistSteps.js";
import { recordUsage, serializeRun, verdictToRunStatus, worstVerdict } from "./shared.js";
import { composePersonaAndRules } from "./systemPrompt.js";

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
  /** Composed Assistant persona + Rules (see orchestrator/systemPrompt.ts). */
  personaPrefix: string;
}

/** One Test Case's checklist, start to finish: generate it, then run its steps via
 * runChecklistSteps. Pulled out of runSuite to keep that function's branching
 * (Insights, run-level pause) readable. */
async function executeTestCase(params: ExecuteTestCaseParams): Promise<StepVerdict> {
  const {
    prisma,
    runId,
    provider,
    pageFactory,
    resolveConfirmation,
    broadcast,
    testCase,
    baseUrl,
    stepIndexCounter,
    personaPrefix,
  } = params;

  const checklist = await generateChecklistFromTestCase({
    provider,
    urlPath: testCase.urlPath,
    steps: testCase.steps,
    expectedResult: testCase.expectedResult,
    personaPrefix,
  });
  await recordUsage(prisma, runId, provider, checklist.usage);

  const page = await pageFactory.getPage(`${baseUrl}${testCase.urlPath}`);

  return runChecklistSteps({
    prisma,
    runId,
    provider,
    page,
    resolveConfirmation,
    broadcast,
    steps: checklist.steps,
    testCaseId: testCase.id,
    stepIndexCounter,
    personaPrefix,
  });
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

  const assistant = await prisma.assistant.findUnique({ where: { id: assistantId } });
  if (!assistant) {
    throw new NotFoundError(`Assistant ${assistantId} not found`);
  }
  const ruleRepo = new RuleRepository(prisma);
  const globalRules = await ruleRepo.listGlobal();
  const projectRules = suite.projectId ? await ruleRepo.listByProject(suite.projectId) : [];
  const personaPrefix = composePersonaAndRules(
    assistant.systemPrompt,
    [...globalRules, ...projectRules].map((rule) => rule.text),
  );

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
        personaPrefix,
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
