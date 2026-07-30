import type { Run, StepLog } from "./entities.js";

/** Messages sent from a client (Electron renderer, or any future client) to the backend. */
export type ClientMessage = { type: "ping"; sentAt: string };

/** Messages sent from the backend to a client. */
export type ServerMessage =
  | { type: "pong"; sentAt: string; serverTime: string }
  | { type: "run:update"; run: Run }
  | { type: "run:step"; runId: string; step: StepLog }
  | { type: "error"; message: string };

export function isClientMessage(value: unknown): value is ClientMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}
