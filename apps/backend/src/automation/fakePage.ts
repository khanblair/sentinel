import type { ElementSummary, Page } from "./page.js";

/** Test double for the Page port — no browser involved. Lets automation/executionLoop
 * tests run deterministically and fast, with the real Playwright wiring verified
 * separately (see playwrightPage.e2e.test.ts). */
export class FakePage implements Page {
  pageTitle = "Fake Page";
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  private readonly textBySelector = new Map<string, string | null>();
  private readonly elements: ElementSummary[] = [];
  private readonly waitFailures = new Set<string>();

  setTextContent(selector: string, text: string | null): void {
    this.textBySelector.set(selector, text);
  }

  setElements(elements: ElementSummary[]): void {
    this.elements.length = 0;
    this.elements.push(...elements);
  }

  failWaitFor(selector: string): void {
    this.waitFailures.add(selector);
  }

  async goto(url: string): Promise<void> {
    this.calls.push({ method: "goto", args: [url] });
  }

  async click(selector: string): Promise<void> {
    this.calls.push({ method: "click", args: [selector] });
  }

  async type(selector: string, value: string): Promise<void> {
    this.calls.push({ method: "type", args: [selector, value] });
  }

  async scroll(selector: string): Promise<void> {
    this.calls.push({ method: "scroll", args: [selector] });
  }

  async waitForSelector(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push({ method: "waitForSelector", args: [selector, timeoutMs] });
    if (this.waitFailures.has(selector)) {
      throw new Error(`Timeout ${timeoutMs}ms exceeded waiting for selector "${selector}"`);
    }
  }

  async textContent(selector: string): Promise<string | null> {
    this.calls.push({ method: "textContent", args: [selector] });
    return this.textBySelector.get(selector) ?? null;
  }

  async title(): Promise<string> {
    return this.pageTitle;
  }

  async listElements(): Promise<ElementSummary[]> {
    return this.elements;
  }
}
