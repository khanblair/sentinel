import { describe, expect, it } from "vitest";
import { generateRunInsights } from "./insights.js";

describe("generateRunInsights", () => {
  it("reports a plain summary when nothing looks systemic", () => {
    const insights = generateRunInsights([
      { verdict: "pass", confidenceReason: "total matched" },
      { verdict: "fail", confidenceReason: "banner text did not include the discount amount" },
    ]);
    expect(insights).toBe("1 passed, 1 failed, 0 blocked.");
  });

  it("flags repeated-action stuck failures as systemic, not independent bugs", () => {
    const insights = generateRunInsights([
      { verdict: "blocked", confidenceReason: "I appear to be repeating the same action with no change in observation." },
      { verdict: "blocked", confidenceReason: "I appear to be repeating the same action with no change in observation." },
      { verdict: "pass", confidenceReason: "ok" },
    ]);
    expect(insights).toContain("Looks systemic");
    expect(insights).toContain("repeating the same action");
  });

  it("flags repeated turn-budget exhaustion as systemic", () => {
    const insights = generateRunInsights([
      { verdict: "blocked", confidenceReason: "Turn budget of 8 exhausted without reaching a verdict." },
      { verdict: "blocked", confidenceReason: "Turn budget of 8 exhausted without reaching a verdict." },
    ]);
    expect(insights).toContain("Looks systemic");
    expect(insights).toContain("turn budget");
  });

  it("flags an all-failures run as looking like a broken environment", () => {
    const insights = generateRunInsights([
      { verdict: "fail", confidenceReason: "reason A" },
      { verdict: "fail", confidenceReason: "reason B" },
    ]);
    expect(insights).toContain("broken environment or precondition");
  });

  it("flags blocked-only runs even with zero outright failures", () => {
    const insights = generateRunInsights([
      { verdict: "pass", confidenceReason: "ok" },
      { verdict: "blocked", confidenceReason: "awaiting tester input" },
    ]);
    expect(insights).toContain("worth a look");
  });

  it("handles an empty run without throwing", () => {
    expect(generateRunInsights([])).toBe("No steps were executed.");
  });
});
