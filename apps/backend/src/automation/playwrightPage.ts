/// <reference lib="dom" />
import type { CDPSession, Page as PlaywrightPageHandle } from "playwright";
import type { ElementSummary, Page, ScreencastFrame } from "./page.js";

const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, [role], img, [aria-label], [onclick]';

/**
 * Wraps a real Playwright page behind the narrow `Page` port. Tags interactive/
 * informative elements with a stable index attribute so tool calls can address them
 * by a plain CSS selector, and surfaces alt/aria-label/checked-state directly —
 * the extraction gaps design §5.3 calls out as already-fixed in Testify.
 */
export class PlaywrightPage implements Page {
  private cdpSession: CDPSession | null = null;
  private screencastListener: ((event: unknown) => void) | null = null;

  constructor(private readonly page: PlaywrightPageHandle) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  async type(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  async scroll(selector: string): Promise<void> {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  async waitForSelector(selector: string, timeoutMs: number): Promise<void> {
    await this.page.waitForSelector(selector, { timeout: timeoutMs });
  }

  async textContent(selector: string): Promise<string | null> {
    return this.page.textContent(selector);
  }

  async title(): Promise<string> {
    return this.page.title();
  }

  async listElements(): Promise<ElementSummary[]> {
    return this.page.evaluate((selector) => {
      const elements = Array.from(document.querySelectorAll(selector));
      return elements.map((element, index) => {
        const el = element as HTMLElement;
        el.dataset.sentinelIndex = String(index);
        const ariaLabel = el.getAttribute("aria-label") ?? el.getAttribute("alt");
        const checked =
          "checked" in el && (el.getAttribute("type") === "checkbox" || el.getAttribute("type") === "radio")
            ? (el as HTMLInputElement).checked
            : null;
        return {
          selector: `[data-sentinel-index="${index}"]`,
          role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
          text: el.textContent?.trim() || null,
          ariaLabel: ariaLabel || null,
          checked,
        };
      });
    }, INTERACTIVE_SELECTOR);
  }

  url(): string {
    return this.page.url();
  }

  private async getCdpSession(): Promise<CDPSession> {
    this.cdpSession ??= await this.page.context().newCDPSession(this.page);
    return this.cdpSession;
  }

  async startScreencast(onFrame: (frame: ScreencastFrame) => void): Promise<void> {
    const session = await this.getCdpSession();
    const listener = (event: unknown): void => {
      const payload = event as { data: string; metadata: ScreencastFrame["metadata"]; sessionId: number };
      // Ack immediately, before handing off to the caller — CDP silently stops the
      // stream if a frame goes unacked, and the caller (e.g. a slow WS send) must
      // never be able to stall that.
      void session.send("Page.screencastFrameAck", { sessionId: payload.sessionId }).catch(() => {});
      onFrame({ dataBase64: payload.data, metadata: payload.metadata });
    };
    this.screencastListener = listener;
    session.on("Page.screencastFrame", listener);
    await session.send("Page.startScreencast", {
      format: "jpeg",
      quality: 60,
      maxWidth: 960,
      maxHeight: 720,
      everyNthFrame: 1,
    });
  }

  async stopScreencast(): Promise<void> {
    if (!this.cdpSession) {
      return;
    }
    await this.cdpSession.send("Page.stopScreencast").catch(() => {});
    if (this.screencastListener) {
      this.cdpSession.off("Page.screencastFrame", this.screencastListener);
      this.screencastListener = null;
    }
  }

  async setViewportSize(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  async describeElementAt(x: number, y: number): Promise<ElementSummary | null> {
    return this.page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py) as HTMLElement | null;
        if (!el) return null;
        const ariaLabel = el.getAttribute("aria-label") ?? el.getAttribute("alt");
        const checked =
          "checked" in el && (el.getAttribute("type") === "checkbox" || el.getAttribute("type") === "radio")
            ? (el as HTMLInputElement).checked
            : null;
        let selector = el.tagName.toLowerCase();
        if (el.id) selector += `#${el.id}`;
        // innerText, not textContent: elementFromPoint on a click near the edge of
        // real content can return <html> or <body> — an ancestor whose textContent
        // includes every descendant text node, including raw <style>/<script> tag
        // bodies. innerText reflects only rendered, visible text.
        return {
          selector,
          role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
          text: el.innerText?.trim().slice(0, 200) || null,
          ariaLabel: ariaLabel || null,
          checked,
        };
      },
      [x, y] as const,
    );
  }
}
