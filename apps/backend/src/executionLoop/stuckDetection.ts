import type { ToolCall } from "../automation/tools.js";

export interface TurnRecord {
  call: ToolCall;
  observation: string;
}

/**
 * Net new vs. Testify (design §6.1): the old loop silently burned its whole turn
 * budget on a repeating action. This treats an identical call + unchanged
 * observation as "stuck" immediately, so the loop can escalate instead of grinding.
 */
export function isRepeating(history: readonly TurnRecord[]): boolean {
  if (history.length < 2) {
    return false;
  }
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (!last || !prev) {
    return false;
  }
  return JSON.stringify(last.call) === JSON.stringify(prev.call) && last.observation === prev.observation;
}
