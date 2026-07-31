import type { ElementSummary } from "@sentinel/shared";

export type { ElementSummary };

/** One CDP `Page.screencastFrame` event, already base64-decoded metadata carried
 * through — `metadata` is exactly what's needed to translate a click on the
 * displayed frame image back into real page coordinates (see previewGate.ts). */
export interface ScreencastFrame {
  dataBase64: string;
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
  };
}

/**
 * Narrow port over whatever actually drives the browser. The action loop and its
 * tests depend on this interface, not on Playwright directly — a FakePage can stand
 * in for unit tests, and only the automation layer itself needs a real browser to
 * verify (see playwrightPage.e2e.test.ts, deliberately excluded from `pnpm test`).
 */
export interface Page {
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, value: string): Promise<void>;
  scroll(selector: string): Promise<void>;
  waitForSelector(selector: string, timeoutMs: number): Promise<void>;
  textContent(selector: string): Promise<string | null>;
  title(): Promise<string>;
  listElements(): Promise<ElementSummary[]>;
  url(): string;
  /** Live preview (design §5.4): CDP screencast, watch-only from the tester's side.
   * onFrame is called with each already-acked frame — the implementation must ack
   * every frame itself (CDP silently stops streaming if a frame goes unacked), never
   * make the caller responsible for it. */
  startScreencast(onFrame: (frame: ScreencastFrame) => void): Promise<void>;
  stopScreencast(): Promise<void>;
  /** Live preview's device/viewport toggle. Never call mid-step (see previewGate.ts)
   * — resizing while a selector-based action is in flight can change what's visible
   * or clickable and produce a spurious step failure. */
  setViewportSize(width: number, height: number): Promise<void>;
  /** Live preview's "select element" — read-only inspection at a point (real page
   * coordinates, already translated from the clicked frame position), like a
   * DevTools element picker. Never clicks or activates anything. */
  describeElementAt(x: number, y: number): Promise<ElementSummary | null>;
}

/** Owns the browser lifecycle across an entire Suite run: one factory, one browser,
 * one page per test case — the orchestrator never talks to Playwright directly. */
export interface PageFactory {
  getPage(url: string): Promise<Page>;
  close(): Promise<void>;
}
