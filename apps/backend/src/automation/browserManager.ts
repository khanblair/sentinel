import { chromium, type Browser } from "playwright";
import type { Page, PageFactory } from "./page.js";
import { PlaywrightPage } from "./playwrightPage.js";

/** Real PageFactory: lazily launches one Chromium instance, reused across every test
 * case in a run; `close()` tears the whole browser down at the end of the run. */
export function createPlaywrightPageFactory(): PageFactory {
  let browserPromise: Promise<Browser> | null = null;

  async function getBrowser(): Promise<Browser> {
    browserPromise ??= chromium.launch();
    return browserPromise;
  }

  return {
    async getPage(url: string): Promise<Page> {
      const browser = await getBrowser();
      const rawPage = await browser.newPage();
      const page = new PlaywrightPage(rawPage);
      await page.goto(url);
      return page;
    },
    async close(): Promise<void> {
      if (browserPromise) {
        const browser = await browserPromise;
        await browser.close();
        browserPromise = null;
      }
    },
  };
}
