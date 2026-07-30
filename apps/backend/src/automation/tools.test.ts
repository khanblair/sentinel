import { describe, expect, it } from "vitest";
import { FakePage } from "./fakePage.js";
import { executeTool } from "./tools.js";

describe("executeTool", () => {
  it("navigate reports the resulting page title in the observation", async () => {
    const page = new FakePage();
    page.pageTitle = "Checkout — SoundWave";
    const result = await executeTool(page, { tool: "navigate", url: "https://example.com/cart" });
    expect(result.observation).toContain("https://example.com/cart");
    expect(result.observation).toContain("Checkout — SoundWave");
  });

  it("extract_text returns a fallback message when no text is found, not null/undefined", async () => {
    const page = new FakePage();
    const result = await executeTool(page, { tool: "extract_text", selector: "#missing" });
    expect(result.observation).toContain("no text content found");
  });

  it("extract_text returns the actual text content when present", async () => {
    const page = new FakePage();
    page.setTextContent("#banner", "10% off applied");
    const result = await executeTool(page, { tool: "extract_text", selector: "#banner" });
    expect(result.observation).toBe("10% off applied");
  });

  it("assert_condition surfaces a structured verdict with confidence and reason", async () => {
    const page = new FakePage();
    const result = await executeTool(page, {
      tool: "assert_condition",
      verdict: "pass",
      confidence: 0.92,
      reason: "the discount line item read exactly '10% off applied'",
    });
    expect(result.verdict).toEqual({
      status: "pass",
      confidence: 0.92,
      reason: "the discount line item read exactly '10% off applied'",
    });
  });

  it("request_input marks the result as requiring confirmation instead of erroring", async () => {
    const page = new FakePage();
    const result = await executeTool(page, { tool: "request_input", prompt: "enter the 2FA code" });
    expect(result.requiresConfirmation).toBe(true);
  });

  it("a failing automation call becomes an observation, not a thrown error", async () => {
    const page = new FakePage();
    page.failWaitFor("#late-element");
    const result = await executeTool(page, {
      tool: "wait_for_element",
      selector: "#late-element",
      timeoutMs: 1000,
    });
    expect(result.observation).toContain("error executing wait_for_element");
    expect(result.verdict).toBeUndefined();
  });
});
