import type { StepVerdict } from "@sentinel/shared";
import type { PromptBroker } from "../executionLoop/confirmation.js";

const CHECKPOINT = 3;

/**
 * Orchestration-level pause (design §6.4), distinct from the user-initiated Stop
 * Run control: if the first few cases all look broken in the same way, offer to
 * stop before grinding through an entire suite. Checked at exactly the Nth case so
 * a tester is asked once, not on every case afterward. Interactive mode only —
 * runSuite never calls the resolver at all in Full-Auto (§9: log into Insights
 * instead of pausing on nobody).
 */
export function shouldOfferEarlyStop(caseVerdicts: readonly StepVerdict[]): boolean {
  if (caseVerdicts.length !== CHECKPOINT) {
    return false;
  }
  return caseVerdicts.every((verdict) => verdict !== "pass");
}

/** Returns true to continue the run, false to stop. Injected explicitly, same DI
 * discipline as ConfirmationResolver/ProviderAdapter. */
export type RunPauseResolver = (prompt: string) => Promise<boolean>;

/** Full-Auto default: never pauses — always continues. */
export const alwaysContinueResolver: RunPauseResolver = async () => true;

/** Interactive mode: asks over WebSocket via the same PromptBroker request_input
 * uses, interpreting the tester's free-text reply. No response (broker timeout) or
 * a reply that isn't clearly an affirmative defaults to stopping — grinding an
 * apparently-broken run further unattended defeats the point of having asked. */
export function createWsRunPauseResolver(broker: PromptBroker, runId: string): RunPauseResolver {
  return async (prompt) => {
    const answer = await broker.request(runId, prompt);
    if (!answer) {
      return false;
    }
    return /^\s*(y|yes|continue)\b/i.test(answer);
  };
}
