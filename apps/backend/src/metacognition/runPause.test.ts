import { describe, expect, it } from "vitest";
import type { PromptBroker } from "../executionLoop/confirmation.js";
import { alwaysContinueResolver, createWsRunPauseResolver, shouldOfferEarlyStop } from "./runPause.js";

describe("shouldOfferEarlyStop", () => {
  it("is false before the third case", () => {
    expect(shouldOfferEarlyStop(["fail"])).toBe(false);
    expect(shouldOfferEarlyStop(["fail", "fail"])).toBe(false);
  });

  it("is true at exactly the third case if all three are non-pass", () => {
    expect(shouldOfferEarlyStop(["fail", "blocked", "fail"])).toBe(true);
  });

  it("is false at the third case if any of the three passed", () => {
    expect(shouldOfferEarlyStop(["fail", "pass", "fail"])).toBe(false);
  });

  it("is false after the third case even if all remain non-pass — only asks once", () => {
    expect(shouldOfferEarlyStop(["fail", "fail", "fail", "fail"])).toBe(false);
  });
});

describe("alwaysContinueResolver", () => {
  it("always resolves true without needing a tester", async () => {
    await expect(alwaysContinueResolver("anything")).resolves.toBe(true);
  });
});

describe("createWsRunPauseResolver", () => {
  function fakeBroker(response: string | null): PromptBroker {
    return { request: async () => response };
  }

  it("continues when the tester replies affirmatively", async () => {
    const resolver = createWsRunPauseResolver(fakeBroker("yes, continue"), "run-1");
    await expect(resolver("prompt")).resolves.toBe(true);
  });

  it("stops when the tester replies with anything else", async () => {
    const resolver = createWsRunPauseResolver(fakeBroker("stop"), "run-1");
    await expect(resolver("prompt")).resolves.toBe(false);
  });

  it("stops when the broker times out with no response", async () => {
    const resolver = createWsRunPauseResolver(fakeBroker(null), "run-1");
    await expect(resolver("prompt")).resolves.toBe(false);
  });
});
