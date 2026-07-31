import type { PrismaClient, Run as PrismaRun, StepLog as PrismaStepLog } from "@prisma/client";
import type { Run, StepLog, StepVerdict } from "@sentinel/shared";
import type { RunMode } from "@sentinel/shared";
import { estimateCostUsd } from "../analytics/cost.js";
import type { ProviderAdapter, TokenUsage } from "../providers/types.js";

/** Shared by runSuite (Suite → many Test Cases) and runAdHoc (one pre-approved
 * checklist, no Suite) — both persist Run/StepLog/ProviderUsage rows the same way
 * and broadcast the same two WebSocket message types for the live ticker. */

const VERDICT_SEVERITY: Record<StepVerdict, number> = { pass: 0, blocked: 1, fail: 2 };

export function worstVerdict(a: StepVerdict, b: StepVerdict): StepVerdict {
  return VERDICT_SEVERITY[b] > VERDICT_SEVERITY[a] ? b : a;
}

export function verdictToRunStatus(verdict: StepVerdict): Run["status"] {
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

export function serializeRun(run: PrismaRun): Run {
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

export function serializeStepLog(step: PrismaStepLog): StepLog {
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

export async function recordUsage(
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
