import type { PrismaClient, Run as PrismaRun, StepLog as PrismaStepLog } from "@prisma/client";
import type { Run, RunMode, ServerMessage, StepLog, StepVerdict } from "@sentinel/shared";
import { generateChecklistFromTestCase } from "../checklistGenerator/index.js";
import { NotFoundError } from "../errors.js";
import { runStep } from "../executionLoop/actionLoop.js";
import type { ConfirmationResolver } from "../executionLoop/confirmation.js";
import type { ProviderAdapter } from "../providers/types.js";
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

/**
 * Runs every active Test Case in a Suite through checklist generation and the action
 * loop, persisting a Run + one StepLog per checklist step, and broadcasting both over
 * WebSocket for the live ticker. A test case stops at its first non-pass step
 * (matches Testify's per-case short-circuit); the Suite's overall verdict is the
 * worst verdict across all its cases.
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
  } = options;

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
      trigger: "manual",
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
    let stepIndex = 0;

    for (const testCase of testCases) {
      const checklist = await generateChecklistFromTestCase({
        provider,
        urlPath: testCase.urlPath,
        steps: testCase.steps,
        expectedResult: testCase.expectedResult,
      });

      const page = await pageFactory.getPage(`${baseUrl}${testCase.urlPath}`);

      let caseVerdict: StepVerdict = "pass";
      for (const instruction of checklist) {
        const result = await runStep({ instruction, page, provider, resolveConfirmation });

        const stepLog = await prisma.stepLog.create({
          data: {
            runId: run.id,
            testCaseId: testCase.id,
            stepIndex: stepIndex++,
            toolCall: JSON.stringify({ turns: result.turns }),
            observation: result.turns.at(-1)?.observation ?? "",
            verdict: result.verdict,
            confidence: result.confidence,
            confidenceReason: result.confidenceReason,
          },
        });
        broadcast({ type: "run:step", runId: run.id, step: serializeStepLog(stepLog) });

        caseVerdict = worstVerdict(caseVerdict, result.verdict);
        if (result.verdict !== "pass") {
          break;
        }
      }
      overallVerdict = worstVerdict(overallVerdict, caseVerdict);
    }

    const finished = await prisma.run.update({
      where: { id: run.id },
      data: {
        status: verdictToRunStatus(overallVerdict),
        finishedAt: new Date(),
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
