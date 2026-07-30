import { describe, expect, it } from "vitest";
import { buildReportRows, type ReportStepLog, type ReportTestCase } from "./buildReportRows.js";

function testCase(overrides: Partial<ReportTestCase> = {}): ReportTestCase {
  return {
    id: "case-1",
    module: "Checkout",
    subModule: "Payment",
    title: "Apply discount",
    priority: "P1",
    urlPath: "/cart",
    precondition: null,
    steps: "1. add item\n2. apply code",
    expectedResult: "total reduced by 10%",
    ...overrides,
  };
}

describe("buildReportRows", () => {
  it("renders a passing case as a single-line note (the last observation)", () => {
    const logs = new Map<string, ReportStepLog[]>([
      [
        "case-1",
        [{ stepIndex: 0, verdict: "pass", observation: "total was $18.00 as expected", confidenceReason: "matched" }],
      ],
    ]);
    const rows = buildReportRows([testCase()], logs);
    expect(rows[0]?.actualStatus).toBe("pass");
    expect(rows[0]?.actualResultNotes).toBe("total was $18.00 as expected");
  });

  it("renders a failing case as a numbered trace, not a single line", () => {
    const logs = new Map<string, ReportStepLog[]>([
      [
        "case-1",
        [
          { stepIndex: 0, verdict: "pass", observation: "navigated to /cart", confidenceReason: "ok" },
          { stepIndex: 1, verdict: "fail", observation: "no discount banner found", confidenceReason: "banner absent from page" },
        ],
      ],
    ]);
    const rows = buildReportRows([testCase()], logs);
    expect(rows[0]?.actualStatus).toBe("fail");
    expect(rows[0]?.actualResultNotes).toContain("1. [pass]");
    expect(rows[0]?.actualResultNotes).toContain("2. [fail]");
    expect(rows[0]?.actualResultNotes).toContain("banner absent from page");
  });

  it("uses the worst verdict across steps as the case's actualStatus", () => {
    const logs = new Map<string, ReportStepLog[]>([
      [
        "case-1",
        [
          { stepIndex: 0, verdict: "pass", observation: "a", confidenceReason: "a" },
          { stepIndex: 1, verdict: "blocked", observation: "b", confidenceReason: "b" },
        ],
      ],
    ]);
    const rows = buildReportRows([testCase()], logs);
    expect(rows[0]?.actualStatus).toBe("blocked");
  });

  it("marks a case with no logs as 'not run' instead of crashing", () => {
    const rows = buildReportRows([testCase()], new Map());
    expect(rows[0]?.actualStatus).toBe("not run");
  });

  it("truncates an individual observation over ~300 characters", () => {
    const longText = "x".repeat(400);
    const logs = new Map<string, ReportStepLog[]>([
      ["case-1", [{ stepIndex: 0, verdict: "pass", observation: longText, confidenceReason: "ok" }]],
    ]);
    const rows = buildReportRows([testCase()], logs);
    expect(rows[0]?.actualResultNotes.length).toBeLessThan(310);
    expect(rows[0]?.actualResultNotes.endsWith("…")).toBe(true);
  });

  it("preserves step order in the trace even if logs arrive out of order", () => {
    const logs = new Map<string, ReportStepLog[]>([
      [
        "case-1",
        [
          { stepIndex: 1, verdict: "fail", observation: "second", confidenceReason: "b" },
          { stepIndex: 0, verdict: "pass", observation: "first", confidenceReason: "a" },
        ],
      ],
    ]);
    const rows = buildReportRows([testCase()], logs);
    const firstIndex = rows[0]?.actualResultNotes.indexOf("first") ?? -1;
    const secondIndex = rows[0]?.actualResultNotes.indexOf("second") ?? -1;
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(secondIndex);
  });
});
