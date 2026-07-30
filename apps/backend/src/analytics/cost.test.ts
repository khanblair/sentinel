import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "./cost.js";

describe("estimateCostUsd", () => {
  it("returns null for a model with no maintained rate, rather than guessing", () => {
    expect(estimateCostUsd("some-model-nobody-added-a-rate-for", 1000, 500)).toBeNull();
  });

  it("returns null even for zero tokens on an unknown model", () => {
    expect(estimateCostUsd("unknown", 0, 0)).toBeNull();
  });
});
