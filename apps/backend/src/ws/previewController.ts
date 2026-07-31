import type { PreviewFrameMetadata, ServerMessage } from "@sentinel/shared";
import type { Page } from "../automation/page.js";

interface RunPreviewState {
  page: Page | null;
  wanted: boolean;
  stepInFlight: boolean;
  screencasting: boolean;
  lastFrameMetadata: PreviewFrameMetadata | null;
}

interface ActionResult {
  ok: boolean;
  reason?: string;
}

const NOT_ATTACHED_REASON = "No active preview for this run.";
const STEP_IN_FLIGHT_REASON = "A step is in progress — try again once it finishes.";

/**
 * Bridges live-preview WS messages (design §5.4) to whichever Page is currently
 * executing for a run. A run's Page changes across its lifetime — runSuite creates a
 * fresh one per Test Case, runAdHoc has just one — attachPage/detachPage keep this in
 * sync with that transition so a client that asked for preview before or during a
 * run keeps seeing frames without needing to re-subscribe per Test Case.
 *
 * Deliberately watch-only during an in-flight step: a viewport resize or element
 * probe racing a live page.click()/waitForSelector() can change what's visible or
 * clickable and produce a StepLog verdict that's actually an artifact of the
 * preview, not the test. beginStep/endStep (wrapped around runStep in
 * runChecklistSteps.ts) are what make that gate correct — see isInteractive.
 */
export class PreviewController {
  private readonly runs = new Map<string, RunPreviewState>();

  constructor(private readonly broadcast: (message: ServerMessage) => void) {}

  private getOrCreate(runId: string): RunPreviewState {
    let state = this.runs.get(runId);
    if (!state) {
      state = { page: null, wanted: false, stepInFlight: false, screencasting: false, lastFrameMetadata: null };
      this.runs.set(runId, state);
    }
    return state;
  }

  async attachPage(runId: string, page: Page): Promise<void> {
    await this.stopScreencastIfRunning(runId);
    const state = this.getOrCreate(runId);
    state.page = page;
    state.lastFrameMetadata = null;
    if (state.wanted) {
      await this.startScreencastIfPossible(runId);
    }
  }

  async detachPage(runId: string): Promise<void> {
    await this.stopScreencastIfRunning(runId);
    const state = this.runs.get(runId);
    if (state) state.page = null;
  }

  async handleStart(runId: string): Promise<void> {
    const state = this.getOrCreate(runId);
    state.wanted = true;
    await this.startScreencastIfPossible(runId);
  }

  async handleStop(runId: string): Promise<void> {
    const state = this.getOrCreate(runId);
    state.wanted = false;
    await this.stopScreencastIfRunning(runId);
  }

  private async startScreencastIfPossible(runId: string): Promise<void> {
    const state = this.runs.get(runId);
    if (!state?.page || state.screencasting) return;
    state.screencasting = true;
    this.broadcast({ type: "preview:url", runId, url: state.page.url() });
    await state.page.startScreencast((frame) => {
      const current = this.runs.get(runId);
      if (current) current.lastFrameMetadata = frame.metadata;
      this.broadcast({ type: "preview:frame", runId, dataBase64: frame.dataBase64, metadata: frame.metadata });
    });
  }

  private async stopScreencastIfRunning(runId: string): Promise<void> {
    const state = this.runs.get(runId);
    if (!state?.page || !state.screencasting) return;
    state.screencasting = false;
    await state.page.stopScreencast();
  }

  /** Wrap the whole runStep(...) call with begin/end — see runChecklistSteps.ts. */
  beginStep(runId: string): void {
    this.getOrCreate(runId).stepInFlight = true;
  }

  endStep(runId: string): void {
    const state = this.runs.get(runId);
    if (state) state.stepInFlight = false;
  }

  isInteractive(runId: string): boolean {
    const state = this.runs.get(runId);
    return Boolean(state?.page) && !state?.stepInFlight;
  }

  async setViewport(runId: string, width: number, height: number): Promise<ActionResult> {
    const state = this.runs.get(runId);
    if (!state?.page) return { ok: false, reason: NOT_ATTACHED_REASON };
    if (state.stepInFlight) return { ok: false, reason: STEP_IN_FLIGHT_REASON };
    await state.page.setViewportSize(width, height);
    return { ok: true };
  }

  /** ratioX/ratioY are 0..1 fractions of the displayed frame image — translated here
   * into real page coordinates using that frame's own CDP metadata, per the
   * standard screencast formula: pageCoord = (ratio * deviceDim) / pageScaleFactor +
   * scrollOffset (offsetTop additionally subtracted from Y for any browser-chrome
   * offset, 0 in this app's headless case). */
  async describeElementAt(
    runId: string,
    ratioX: number,
    ratioY: number,
  ): Promise<{ ok: true; element: Awaited<ReturnType<Page["describeElementAt"]>> } | { ok: false; reason: string }> {
    const state = this.runs.get(runId);
    if (!state?.page) return { ok: false, reason: NOT_ATTACHED_REASON };
    if (state.stepInFlight) return { ok: false, reason: STEP_IN_FLIGHT_REASON };
    if (!state.lastFrameMetadata) return { ok: false, reason: "No frame received yet." };
    const m = state.lastFrameMetadata;
    const x = (ratioX * m.deviceWidth) / m.pageScaleFactor + m.scrollOffsetX;
    const y = (ratioY * m.deviceHeight - m.offsetTop) / m.pageScaleFactor + m.scrollOffsetY;
    const element = await state.page.describeElementAt(x, y);
    return { ok: true, element };
  }

  /** Called once the run finishes entirely so this map doesn't grow unboundedly
   * across the backend process's lifetime. */
  cleanup(runId: string): void {
    this.runs.delete(runId);
  }
}
