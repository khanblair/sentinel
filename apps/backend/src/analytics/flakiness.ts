import type { StepVerdict } from "@sentinel/shared";

export interface CaseRunOutcome {
  testCaseId: string;
  runId: string;
  startedAt: Date;
  verdict: StepVerdict;
}

export interface FlakyCase {
  testCaseId: string;
  flipCount: number;
  recentVerdicts: StepVerdict[];
}

/**
 * A case is "flaky" if its pass/non-pass outcome flips across recent runs — not
 * just fails consistently. Consistent failure is a real bug; alternating pass/fail
 * for the same case across runs is what "flaky" means (design §5.10), distinct from
 * the systemic-failure pattern Insights (§6.3) looks for within a single run.
 */
export function countFlips(outcomesAsc: readonly CaseRunOutcome[]): number {
  let flips = 0;
  for (let i = 1; i < outcomesAsc.length; i += 1) {
    const prevPass = outcomesAsc[i - 1]?.verdict === "pass";
    const currPass = outcomesAsc[i]?.verdict === "pass";
    if (prevPass !== currPass) {
      flips += 1;
    }
  }
  return flips;
}

/** Groups outcomes by test case, sorts each group by time, and ranks by flip count
 * descending — the flakiest cases first. */
export function rankFlakyCases(outcomes: readonly CaseRunOutcome[]): FlakyCase[] {
  const byCase = new Map<string, CaseRunOutcome[]>();
  for (const outcome of outcomes) {
    const list = byCase.get(outcome.testCaseId) ?? [];
    list.push(outcome);
    byCase.set(outcome.testCaseId, list);
  }

  const results: FlakyCase[] = [];
  for (const [testCaseId, list] of byCase) {
    const sorted = [...list].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    results.push({
      testCaseId,
      flipCount: countFlips(sorted),
      recentVerdicts: sorted.map((o) => o.verdict),
    });
  }
  return results.sort((a, b) => b.flipCount - a.flipCount);
}
