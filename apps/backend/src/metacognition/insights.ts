import type { StepVerdict } from "@sentinel/shared";

export interface InsightStepLog {
  verdict: StepVerdict;
  confidenceReason: string;
}

const SYSTEMIC_MIN_COUNT = 2;

/**
 * The automatic Run Insights pass (design §6.3): a heuristic, rule-based read of a
 * finished run's step results — no separate AI session pasting a report back in for
 * root-cause analysis, the product does it inline. Deliberately not an LLM call:
 * this needs to be deterministic and always available, not one more thing that can
 * fail or drift in phrasing across providers.
 */
export function generateRunInsights(steps: readonly InsightStepLog[]): string {
  const passCount = steps.filter((s) => s.verdict === "pass").length;
  const failCount = steps.filter((s) => s.verdict === "fail").length;
  const blockedCount = steps.filter((s) => s.verdict === "blocked").length;
  const summary = `${passCount} passed, ${failCount} failed, ${blockedCount} blocked.`;

  if (steps.length === 0) {
    return "No steps were executed.";
  }

  const nonPass = steps.filter((s) => s.verdict !== "pass");
  const repeatingCount = nonPass.filter((s) =>
    s.confidenceReason.toLowerCase().includes("repeating the same action"),
  ).length;
  if (repeatingCount >= SYSTEMIC_MIN_COUNT) {
    return `${summary} Looks systemic: ${repeatingCount} step(s) got stuck repeating the same action — likely a tooling/automation limitation (a selector or page state issue), not independent site bugs.`;
  }

  const budgetExhaustedCount = nonPass.filter((s) =>
    s.confidenceReason.toLowerCase().includes("turn budget"),
  ).length;
  if (budgetExhaustedCount >= SYSTEMIC_MIN_COUNT) {
    return `${summary} Looks systemic: ${budgetExhaustedCount} step(s) exhausted their turn budget without reaching a verdict — the checklist steps may be too broad, or the page is slower/more complex than the turn budget allows.`;
  }

  if (blockedCount > 0 && failCount === 0) {
    return `${summary} No outright failures, but ${blockedCount} step(s) were blocked — worth a look before trusting this as a clean pass.`;
  }

  if (failCount >= SYSTEMIC_MIN_COUNT && passCount === 0) {
    return `${summary} Every executed step failed — this looks more like a broken environment or precondition than ${failCount} independent bugs.`;
  }

  return summary;
}
