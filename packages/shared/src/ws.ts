import type { Run, StepLog } from "./entities.js";

/** Messages sent from a client (Electron renderer, or any future client) to the backend. */
export type ClientMessage =
  | { type: "ping"; sentAt: string }
  | { type: "run:prompt-response"; requestId: string; value: string | null };

/** Messages sent from the backend to a client. */
export type ServerMessage =
  | { type: "pong"; sentAt: string; serverTime: string }
  | { type: "run:update"; run: Run }
  | { type: "run:step"; runId: string; step: StepLog }
  /** Interactive mode's pause-and-ask (design §4.3): the tester answers with a
   * run:prompt-response carrying the same requestId, or the backend's own timeout
   * resolves it as unanswered — either way runStep resumes, it never hangs forever. */
  | { type: "run:prompt"; runId: string; requestId: string; prompt: string }
  | { type: "error"; message: string };

export function isClientMessage(value: unknown): value is ClientMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}
