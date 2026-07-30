import { describe, expect, it } from "vitest";
import { FakePage } from "../automation/fakePage.js";
import { FakeProvider } from "../providers/fakeProvider.js";
import { runStep } from "./actionLoop.js";

describe("runStep", () => {
  it("reaches a pass verdict that carries a non-empty confidence reason", async () => {
    const page = new FakePage();
    page.setTextContent("#total", "$18.00");
    const provider = new FakeProvider()
      .queueObject({
        object: { toolCall: { tool: "extract_text", selector: "#total" } },
        usage: { promptTokens: 10, completionTokens: 5 },
      })
      .queueObject({
        object: {
          toolCall: {
            tool: "assert_condition",
            verdict: "pass",
            confidence: 0.95,
            reason: "the #total element read exactly '$18.00' as expected",
          },
        },
        usage: { promptTokens: 10, completionTokens: 5 },
      });

    const result = await runStep({ instruction: "check total is $18.00", page, provider });

    expect(result.verdict).toBe("pass");
    expect(result.confidence).toBeCloseTo(0.95);
    expect(result.confidenceReason.length).toBeGreaterThan(0);
    expect(result.turns).toHaveLength(2);
  });

  it("reaches a fail verdict that also carries a non-empty confidence reason", async () => {
    const page = new FakePage();
    const provider = new FakeProvider().queueObject({
      object: {
        toolCall: {
          tool: "assert_condition",
          verdict: "fail",
          confidence: 0.8,
          reason: "the discount banner was not present anywhere in the page",
        },
      },
      usage: { promptTokens: 10, completionTokens: 5 },
    });

    const result = await runStep({ instruction: "check discount banner shown", page, provider });

    expect(result.verdict).toBe("fail");
    expect(result.confidenceReason).toContain("discount banner");
  });

  it("concludes blocked on repetition without burning the whole turn budget", async () => {
    const page = new FakePage(); // clicking never changes any observable state
    const provider = new FakeProvider();
    for (let i = 0; i < 8; i += 1) {
      provider.queueObject({
        object: { toolCall: { tool: "click", selector: "#retry" } },
        usage: { promptTokens: 5, completionTokens: 2 },
      });
    }

    const result = await runStep({ instruction: "click retry", page, provider, turnBudget: 8 });

    expect(result.verdict).toBe("blocked");
    expect(result.confidenceReason).toMatch(/repeating the same action/i);
    // Two identical turns are enough to detect repetition — must not consume all 8.
    expect(result.turns.length).toBeLessThan(8);
    expect(result.turns).toHaveLength(2);
  });

  it("concludes blocked when the turn budget is exhausted without a verdict", async () => {
    const page = new FakePage();
    const provider = new FakeProvider();
    // Each call clicks a different selector, so repetition never triggers.
    for (let i = 0; i < 3; i += 1) {
      provider.queueObject({
        object: { toolCall: { tool: "click", selector: `#step-${i}` } },
        usage: { promptTokens: 5, completionTokens: 2 },
      });
    }

    const result = await runStep({ instruction: "wander indefinitely", page, provider, turnBudget: 3 });

    expect(result.verdict).toBe("blocked");
    expect(result.confidenceReason).toMatch(/turn budget of 3 exhausted/i);
    expect(result.turns).toHaveLength(3);
  });

  it("concludes blocked immediately when the model requests tester input", async () => {
    const page = new FakePage();
    const provider = new FakeProvider().queueObject({
      object: { toolCall: { tool: "request_input", prompt: "enter the emailed 2FA code" } },
      usage: { promptTokens: 5, completionTokens: 2 },
    });

    const result = await runStep({ instruction: "verify 2FA", page, provider });

    expect(result.verdict).toBe("blocked");
    expect(result.confidenceReason).toContain("2FA code");
    expect(result.turns).toHaveLength(1);
  });
});
