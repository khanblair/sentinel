/// <reference lib="dom" />
import type { Page as PlaywrightPageHandle } from "playwright";
import type { ElementSummary, Page } from "./page.js";

const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, [role], img, [aria-label], [onclick]';

/**
 * Wraps a real Playwright page behind the narrow `Page` port. Tags interactive/
 * informative elements with a stable index attribute so tool calls can address them
 * by a plain CSS selector, and surfaces alt/aria-label/checked-state directly —
 * the extraction gaps design §5.3 calls out as already-fixed in Testify.
 */
export class PlaywrightPage implements Page {
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
}
