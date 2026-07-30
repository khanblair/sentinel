import { describe, expect, it } from "vitest";
import { FakeProvider } from "../providers/fakeProvider.js";
import { generateChecklistFromInstruction, generateChecklistFromTestCase } from "./index.js";

describe("generateChecklistFromTestCase", () => {
  it("returns the steps produced by the provider", async () => {
    const provider = new FakeProvider().queueObject({
      object: { steps: ["Navigate to /cart", "Apply code SAVE10", "Assert total reduced by 10%"] },
      usage: { promptTokens: 20, completionTokens: 15 },
    });

    const steps = await generateChecklistFromTestCase({
      provider,
      urlPath: "/cart",
      steps: "1. add item\n2. apply code SAVE10",
      expectedResult: "total reduced by 10%",
    });

    expect(steps).toEqual(["Navigate to /cart", "Apply code SAVE10", "Assert total reduced by 10%"]);
    expect(provider.calls).toHaveLength(1);
    expect(String(provider.calls[0]?.prompt)).toContain("SAVE10");
  });
});

describe("generateChecklistFromInstruction", () => {
  it("passes the URL and free-text instruction through to the provider prompt", async () => {
    const provider = new FakeProvider().queueObject({
      object: { steps: ["Load the checkout page", "Trigger a validation error", "Assert the error message text"] },
      usage: { promptTokens: 20, completionTokens: 15 },
    });

    const steps = await generateChecklistFromInstruction({
      provider,
      url: "https://example.com/checkout",
      instruction: "test checkout, focus on validation errors",
    });

    expect(steps).toHaveLength(3);
    const prompt = String(provider.calls[0]?.prompt);
    expect(prompt).toContain("https://example.com/checkout");
    expect(prompt).toContain("validation errors");
  });
});
