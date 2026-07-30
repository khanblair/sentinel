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
