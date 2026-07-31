import type { PrismaClient } from "@prisma/client";
import type { ServerMessage, StepVerdict } from "@sentinel/shared";
import type { Page } from "../automation/page.js";
import { runStep, type StepResult } from "../executionLoop/actionLoop.js";
import type { ConfirmationResolver } from "../executionLoop/confirmation.js";
import type { ProviderAdapter } from "../providers/types.js";
import { recordUsage, serializeStepLog, worstVerdict } from "./shared.js";

export interface RunChecklistStepsParams {
  prisma: PrismaClient;
  runId: string;
  provider: ProviderAdapter;
  page: Page;
  resolveConfirmation: ConfirmationResolver;
  broadcast: (message: ServerMessage) => void;
  steps: readonly string[];
  /** Null for ad-hoc runs, which have no Test Case to attribute a StepLog to. */
  testCaseId: string | null;
  /** Shared across every checklist executed in the same Run so StepLog.stepIndex is
   * unique per Run, not just per checklist. */
  stepIndexCounter: { value: number };
  personaPrefix: string;
}

/** Executes one already-generated checklist's steps to a verdict: run each step,
 * persist a StepLog + broadcast it, stop at the first non-pass step. Used by both
 * runSuite (one checklist per Test Case) and runAdHoc (one checklist, no Test Case). */
export async function runChecklistSteps(params: RunChecklistStepsParams): Promise<StepVerdict> {
  const { prisma, runId, provider, page, resolveConfirmation, broadcast, steps, testCaseId, stepIndexCounter, personaPrefix } =
    params;

  let verdict: StepVerdict = "pass";
  for (const instruction of steps) {
    const result: StepResult = await runStep({ instruction, page, provider, resolveConfirmation, personaPrefix });
    await recordUsage(prisma, runId, provider, result.usage);

    const stepLog = await prisma.stepLog.create({
      data: {
        runId,
        testCaseId,
        stepIndex: stepIndexCounter.value++,
        toolCall: JSON.stringify({ turns: result.turns }),
        observation: result.turns.at(-1)?.observation ?? "",
        verdict: result.verdict,
        confidence: result.confidence,
        confidenceReason: result.confidenceReason,
      },
    });
    broadcast({ type: "run:step", runId, step: serializeStepLog(stepLog) });

    verdict = worstVerdict(verdict, result.verdict);
    if (result.verdict !== "pass") {
      break;
    }
  }
  return verdict;
}
