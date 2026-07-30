import { describe, expect, it } from "vitest";
import { countFlips, rankFlakyCases, type CaseRunOutcome } from "./flakiness.js";

function outcome(testCaseId: string, runId: string, hoursAgo: number, verdict: CaseRunOutcome["verdict"]): CaseRunOutcome {
  return { testCaseId, runId, startedAt: new Date(Date.now() - hoursAgo * 3_600_000), verdict };
}

describe("countFlips", () => {
  it("is 0 for a run of all-pass outcomes", () => {
    const outcomes = [outcome("a", "r1", 3, "pass"), outcome("a", "r2", 2, "pass"), outcome("a", "r3", 1, "pass")];
    expect(countFlips(outcomes)).toBe(0);
  });

  it("is 0 for a run of consistent failures — that's a real bug, not flakiness", () => {
    const outcomes = [outcome("a", "r1", 3, "fail"), outcome("a", "r2", 2, "fail"), outcome("a", "r3", 1, "fail")];
    expect(countFlips(outcomes)).toBe(0);
  });

  it("counts each pass<->non-pass transition", () => {
    const outcomes = [
      outcome("a", "r1", 4, "pass"),
      outcome("a", "r2", 3, "fail"),
      outcome("a", "r3", 2, "pass"),
      outcome("a", "r4", 1, "blocked"),
    ];
    expect(countFlips(outcomes)).toBe(3);
  });

  it("treats fail and blocked as the same 'non-pass' bucket — no flip between them", () => {
    const outcomes = [outcome("a", "r1", 2, "fail"), outcome("a", "r2", 1, "blocked")];
    expect(countFlips(outcomes)).toBe(0);
  });
});

describe("rankFlakyCases", () => {
  it("groups by test case and ranks the flakiest first", () => {
    const stable = [outcome("stable", "r1", 3, "pass"), outcome("stable", "r2", 2, "pass"), outcome("stable", "r3", 1, "pass")];
    const flaky = [outcome("flaky", "r1", 3, "pass"), outcome("flaky", "r2", 2, "fail"), outcome("flaky", "r3", 1, "pass")];

    const ranked = rankFlakyCases([...stable, ...flaky]);

    expect(ranked[0]?.testCaseId).toBe("flaky");
    expect(ranked[0]?.flipCount).toBe(2);
    expect(ranked[1]?.testCaseId).toBe("stable");
    expect(ranked[1]?.flipCount).toBe(0);
  });

  it("orders recentVerdicts chronologically regardless of input order", () => {
    const outcomes = [outcome("a", "r2", 1, "fail"), outcome("a", "r1", 2, "pass")];
    const ranked = rankFlakyCases(outcomes);
    expect(ranked[0]?.recentVerdicts).toEqual(["pass", "fail"]);
  });
});
