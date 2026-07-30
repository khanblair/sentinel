import { describe, expect, it } from "vitest";
import { isRepeating, type TurnRecord } from "./stuckDetection.js";

function turn(selector: string, observation: string): TurnRecord {
  return { call: { tool: "click", selector }, observation };
}

describe("isRepeating", () => {
  it("returns false with fewer than two turns", () => {
    expect(isRepeating([])).toBe(false);
    expect(isRepeating([turn("#a", "clicked #a")])).toBe(false);
  });

  it("returns false when the tool call differs", () => {
    const history = [turn("#a", "clicked #a"), turn("#b", "clicked #b")];
    expect(isRepeating(history)).toBe(false);
  });

  it("returns false when the call repeats but the observation changed", () => {
    const history = [turn("#a", "state 1"), turn("#a", "state 2")];
    expect(isRepeating(history)).toBe(false);
  });

  it("returns true when the identical call produces the identical observation twice in a row", () => {
    const history = [turn("#a", "nothing happened"), turn("#a", "nothing happened")];
    expect(isRepeating(history)).toBe(true);
  });

  it("only looks at the most recent two turns, not the whole history", () => {
    const history = [
      turn("#a", "nothing happened"),
      turn("#a", "nothing happened"),
      turn("#b", "clicked #b"),
    ];
    expect(isRepeating(history)).toBe(false);
  });

  it("detects repetition of a non-click tool call (e.g. wait_for_element)", () => {
    const waitCall = { tool: "wait_for_element" as const, selector: "#late", timeoutMs: 5000 };
    const history: TurnRecord[] = [
      { call: waitCall, observation: "timed out waiting for #late" },
      { call: waitCall, observation: "timed out waiting for #late" },
    ];
    expect(isRepeating(history)).toBe(true);
  });
});
