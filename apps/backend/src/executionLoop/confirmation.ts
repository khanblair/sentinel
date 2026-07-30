export interface ConfirmationRequest {
  tool: "request_input" | "request_tester_action";
  prompt: string;
}

/** Returns the tester's answer, or null if none was (or could be) provided.
 * Injected explicitly into runStep — never a module-level default — so Interactive
 * and Full-Auto runs are an explicit caller choice, not a hidden fallback. */
export type ConfirmationResolver = (request: ConfirmationRequest) => Promise<string | null>;

/** Full-Auto default (design §9): never blocks waiting for a human. Resolves
 * immediately with "no value provided" so judgment can fail the step instead of the
 * run hanging forever with nobody present to answer. */
export const fullAutoResolver: ConfirmationResolver = async () => null;

/** Narrow port over whatever actually publishes run:prompt / awaits
 * run:prompt-response over WebSocket — keeps this module ignorant of `ws`. */
export interface PromptBroker {
  request(runId: string, prompt: string): Promise<string | null>;
}

/** Interactive mode (design §4.3): pause-and-ask cards. Every request_input/
 * request_tester_action call is routed through the broker for this specific run. */
export function createInteractiveResolver(broker: PromptBroker, runId: string): ConfirmationResolver {
  return async (request) => broker.request(runId, request.prompt);
}
