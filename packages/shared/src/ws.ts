import type { ElementSummary, Run, StepLog } from "./entities.js";

/** Exactly the CDP `Page.screencastFrame` metadata fields needed to translate a
 * click on the displayed frame image back into real page coordinates. */
export interface PreviewFrameMetadata {
  offsetTop: number;
  pageScaleFactor: number;
  deviceWidth: number;
  deviceHeight: number;
  scrollOffsetX: number;
  scrollOffsetY: number;
}

/** Messages sent from a client (Electron renderer, or any future client) to the backend. */
export type ClientMessage =
  | { type: "ping"; sentAt: string }
  | { type: "run:prompt-response"; requestId: string; value: string | null }
  /** Live preview (design §5.4): watch-only screencast of the run's active browser
   * page. Toggling the panel on/off maps directly to start/stop — see
   * ws/previewController.ts for what happens while no run is active yet, or across
   * a run's page transitions between Test Cases. */
  | { type: "preview:start"; runId: string }
  | { type: "preview:stop"; runId: string }
  /** Device/viewport toggle. Rejected (via preview:action-result) whenever a step is
   * currently in flight — see automation/page.ts's setViewportSize doc comment. */
  | { type: "preview:set-viewport"; runId: string; width: number; height: number }
  /** "Select element" — read-only inspection at a point on the displayed frame,
   * expressed as a 0..1 ratio of the frame's own width/height (not raw pixels): the
   * backend translates that into real page coordinates using the frame's own
   * metadata, which the renderer doesn't have enough information to do itself. */
  | { type: "preview:select-element"; runId: string; ratioX: number; ratioY: number };

/** Messages sent from the backend to a client. */
export type ServerMessage =
  | { type: "pong"; sentAt: string; serverTime: string }
  | { type: "run:update"; run: Run }
  | { type: "run:step"; runId: string; step: StepLog }
  /** Interactive mode's pause-and-ask (design §4.3): the tester answers with a
   * run:prompt-response carrying the same requestId, or the backend's own timeout
   * resolves it as unanswered — either way runStep resumes, it never hangs forever. */
  | { type: "run:prompt"; runId: string; requestId: string; prompt: string }
  | { type: "preview:frame"; runId: string; dataBase64: string; metadata: PreviewFrameMetadata }
  | { type: "preview:url"; runId: string; url: string }
  | { type: "preview:element"; runId: string; element: ElementSummary | null; reason?: string }
  | { type: "preview:action-result"; runId: string; ok: boolean; reason?: string }
  | { type: "error"; message: string };

export function isClientMessage(value: unknown): value is ClientMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}
