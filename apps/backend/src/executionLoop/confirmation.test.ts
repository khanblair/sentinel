import { describe, expect, it } from "vitest";
import { createInteractiveResolver, fullAutoResolver, type PromptBroker } from "./confirmation.js";

describe("fullAutoResolver", () => {
  it("always resolves to null without needing a broker", async () => {
    await expect(fullAutoResolver({ tool: "request_input", prompt: "anything" })).resolves.toBeNull();
  });
});

describe("createInteractiveResolver", () => {
  it("delegates to the broker with the run id and prompt", async () => {
    const calls: Array<{ runId: string; prompt: string }> = [];
    const broker: PromptBroker = {
      async request(runId, prompt) {
        calls.push({ runId, prompt });
        return "tester-answer";
      },
    };

    const resolver = createInteractiveResolver(broker, "run-1");
    const answer = await resolver({ tool: "request_tester_action", prompt: "check your email" });

    expect(answer).toBe("tester-answer");
    expect(calls).toEqual([{ runId: "run-1", prompt: "check your email" }]);
  });
});
