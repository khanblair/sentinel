import { describe, expect, it } from "vitest";
import { computeModuleRiskHeatmap, type ModuleOutcome } from "./heatmap.js";

describe("computeModuleRiskHeatmap", () => {
  it("computes fail rate per module/subModule group", () => {
    const outcomes: ModuleOutcome[] = [
      { module: "Checkout", subModule: "Payment", verdict: "pass" },
      { module: "Checkout", subModule: "Payment", verdict: "fail" },
      { module: "Checkout", subModule: "Payment", verdict: "fail" },
      { module: "Checkout", subModule: "Payment", verdict: "pass" },
    ];
    const result = computeModuleRiskHeatmap(outcomes);
    expect(result).toEqual([
      { module: "Checkout", subModule: "Payment", total: 4, failCount: 2, failRate: 0.5 },
    ]);
  });

  it("ranks highest fail rate first across multiple groups", () => {
    const outcomes: ModuleOutcome[] = [
      { module: "Login", subModule: null, verdict: "pass" },
      { module: "Login", subModule: null, verdict: "pass" },
      { module: "Search", subModule: null, verdict: "fail" },
      { module: "Search", subModule: null, verdict: "blocked" },
    ];
    const result = computeModuleRiskHeatmap(outcomes);
    expect(result[0]?.module).toBe("Search");
    expect(result[0]?.failRate).toBe(1);
    expect(result[1]?.module).toBe("Login");
    expect(result[1]?.failRate).toBe(0);
  });

  it("treats a null subModule as its own group, distinct from a named one", () => {
    const outcomes: ModuleOutcome[] = [
      { module: "Checkout", subModule: null, verdict: "fail" },
      { module: "Checkout", subModule: "Payment", verdict: "pass" },
    ];
    const result = computeModuleRiskHeatmap(outcomes);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array for no outcomes", () => {
    expect(computeModuleRiskHeatmap([])).toEqual([]);
  });
});
