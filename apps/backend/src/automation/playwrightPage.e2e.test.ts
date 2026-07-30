import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlaywrightPage } from "./playwrightPage.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = `file://${join(currentDir, "../../test/fixtures/sample.html")}`;

// Excluded from `pnpm test` (see vitest.config.ts) — run explicitly via `pnpm test:e2e`.
// Verifies the PlaywrightPage adapter against a real Chromium instance, since the rest
// of the automation/executionLoop suite deliberately runs against FakePage instead.
describe("PlaywrightPage against a real browser", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("navigates, reads title, clicks, and extracts resulting text", async () => {
    const rawPage = await browser.newPage();
    const page = new PlaywrightPage(rawPage);

    await page.goto(fixtureUrl);
    expect(await page.title()).toBe("Sentinel Fixture Page");
    expect(await page.textContent("#message")).toBe("Hello from the fixture");

    await page.click("#reveal");

    await rawPage.close();
  });

  it("exposes alt text and checked-state in listElements (design §5.3 extraction fixes)", async () => {
    const rawPage = await browser.newPage();
    const page = new PlaywrightPage(rawPage);
    await page.goto(fixtureUrl);

    await page.click("#agree");
    const elements = await page.listElements();

    const logo = elements.find((el) => el.ariaLabel === "Sentinel logo");
    expect(logo).toBeDefined();

    const checkbox = elements.find((el) => el.ariaLabel === "I agree to the terms");
    expect(checkbox?.checked).toBe(true);

    await rawPage.close();
  });
});
