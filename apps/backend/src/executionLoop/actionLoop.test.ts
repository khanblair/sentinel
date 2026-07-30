import { describe, expect, it } from "vitest";
import { FakePage } from "../automation/fakePage.js";
import type { ConfirmationRequest } from "./confirmation.js";
import { fullAutoResolver } from "./confirmation.js";
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

    const result = await runStep({
      instruction: "check total is $18.00",
      page,
      provider,
      resolveConfirmation: fullAutoResolver,
    });

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

    const result = await runStep({
      instruction: "check discount banner shown",
      page,
      provider,
      resolveConfirmation: fullAutoResolver,
    });

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

    const result = await runStep({
      instruction: "click retry",
      page,
      provider,
      resolveConfirmation: fullAutoResolver,
      turnBudget: 8,
    });

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

    const result = await runStep({
      instruction: "wander indefinitely",
      page,
      provider,
      resolveConfirmation: fullAutoResolver,
      turnBudget: 3,
    });

    expect(result.verdict).toBe("blocked");
    expect(result.confidenceReason).toMatch(/turn budget of 3 exhausted/i);
    expect(result.turns).toHaveLength(3);
  });

  it("Full-Auto default: request_input resolves to no value and the loop continues instead of hanging", async () => {
    const page = new FakePage();
    const provider = new FakeProvider()
      .queueObject({
        object: { toolCall: { tool: "request_input", prompt: "enter the emailed 2FA code" } },
        usage: { promptTokens: 5, completionTokens: 2 },
      })
      .queueObject({
        object: {
          toolCall: {
            tool: "assert_condition",
            verdict: "fail",
            confidence: 0.9,
            reason: "no 2FA code was available, so the verification step could not pass",
          },
        },
        usage: { promptTokens: 5, completionTokens: 2 },
      });

    const result = await runStep({
      instruction: "verify 2FA",
      page,
      provider,
      resolveConfirmation: fullAutoResolver,
    });

    // The step reaches a real verdict — it does not hang or block on the unanswered
    // request, matching design §9's "let judgment fail the step" default.
    expect(result.verdict).toBe("fail");
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0]?.observation).toContain("no value provided");
  });

  it("Interactive mode: a resolver that answers lets the loop proceed with the tester's value", async () => {
    const page = new FakePage();
    const seenRequests: ConfirmationRequest[] = [];
    const interactiveResolver = async (request: ConfirmationRequest): Promise<string | null> => {
      seenRequests.push(request);
      return "123456";
    };

    const provider = new FakeProvider()
      .queueObject({
        object: { toolCall: { tool: "request_input", prompt: "enter the emailed 2FA code" } },
        usage: { promptTokens: 5, completionTokens: 2 },
      })
      .queueObject({
        object: {
          toolCall: {
            tool: "assert_condition",
            verdict: "pass",
            confidence: 0.9,
            reason: "the tester-provided code 123456 was accepted",
          },
        },
        usage: { promptTokens: 5, completionTokens: 2 },
      });

    const result = await runStep({
      instruction: "verify 2FA",
      page,
      provider,
      resolveConfirmation: interactiveResolver,
    });

    expect(seenRequests).toEqual([{ tool: "request_input", prompt: "enter the emailed 2FA code" }]);
    expect(result.verdict).toBe("pass");
    expect(result.turns[0]?.observation).toContain("123456");
  });
});
