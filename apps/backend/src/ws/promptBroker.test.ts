import type { ServerMessage } from "@sentinel/shared";
import { describe, expect, it } from "vitest";
import { WsPromptBroker } from "./promptBroker.js";

describe("WsPromptBroker", () => {
  it("broadcasts a run:prompt message and resolves when respond() is called with a matching id", async () => {
    const messages: ServerMessage[] = [];
    const broker = new WsPromptBroker((message) => messages.push(message));

    const requestPromise = broker.request("run-1", "enter the 2FA code");

    expect(messages).toHaveLength(1);
    const prompt = messages[0];
    expect(prompt?.type).toBe("run:prompt");
    if (prompt?.type !== "run:prompt") {
      throw new Error("expected a run:prompt message");
    }
    expect(prompt.runId).toBe("run-1");
    expect(prompt.prompt).toBe("enter the 2FA code");

    broker.respond(prompt.requestId, "123456");
    await expect(requestPromise).resolves.toBe("123456");
  });

  it("ignores a respond() call for an unknown or already-resolved request id", async () => {
    const broker = new WsPromptBroker(() => {});
    expect(() => broker.respond("does-not-exist", "value")).not.toThrow();
  });

  it("resolves to null if nothing responds before the timeout", async () => {
    const broker = new WsPromptBroker(() => {}, 10);
    const answer = await broker.request("run-1", "prompt");
    expect(answer).toBeNull();
  });

  it("tracks pending request count and clears it once resolved", async () => {
    const messages: ServerMessage[] = [];
    const broker = new WsPromptBroker((message) => messages.push(message));

    const pending = broker.request("run-1", "prompt");
    expect(broker.pendingCount).toBe(1);

    const prompt = messages[0];
    if (prompt?.type !== "run:prompt") {
      throw new Error("expected a run:prompt message");
    }
    broker.respond(prompt.requestId, "answer");
    await pending;
    expect(broker.pendingCount).toBe(0);
  });
});
