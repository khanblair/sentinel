import { FakePage } from "./fakePage.js";
import type { Page, PageFactory } from "./page.js";

/** Test double for PageFactory — records every requested URL and page so orchestrator
 * tests can assert on them without a real browser. */
export class FakePageFactory implements PageFactory {
  readonly pages: FakePage[] = [];
  readonly requestedUrls: string[] = [];
  closed = false;

  async getPage(url: string): Promise<Page> {
    this.requestedUrls.push(url);
    const page = new FakePage();
    this.pages.push(page);
    return page;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
