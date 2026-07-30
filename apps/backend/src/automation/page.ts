export interface ElementSummary {
  selector: string;
  role: string | null;
  text: string | null;
  ariaLabel: string | null;
  checked: boolean | null;
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
}
