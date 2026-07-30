import { randomUUID } from "node:crypto";
import type { ServerMessage } from "@sentinel/shared";
import type { PromptBroker as PromptBrokerPort } from "../executionLoop/confirmation.js";

interface PendingEntry {
  resolve: (value: string | null) => void;
  timeout: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Implements the executionLoop's PromptBroker port: publishes a run:prompt over
 * WebSocket and resolves when a matching run:prompt-response arrives via respond().
 * If nothing answers within the timeout, resolves to null — same "no value
 * provided" default as Full-Auto, so a disconnected client can't hang a run forever.
 */
export class WsPromptBroker implements PromptBrokerPort {
  private readonly pending = new Map<string, PendingEntry>();

  constructor(
    private readonly broadcast: (message: ServerMessage) => void,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async request(runId: string, prompt: string): Promise<string | null> {
    const requestId = randomUUID();
    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        resolve(null);
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, timeout });
      this.broadcast({ type: "run:prompt", runId, requestId, prompt });
    });
  }

  respond(requestId: string, value: string | null): void {
    const entry = this.pending.get(requestId);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timeout);
    this.pending.delete(requestId);
    entry.resolve(value);
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
