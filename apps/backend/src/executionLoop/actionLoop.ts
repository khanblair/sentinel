import { z } from "zod";
import type { StepVerdict } from "@sentinel/shared";
import type { Page } from "../automation/page.js";
import { executeTool, toolCallSchema, type ToolCall } from "../automation/tools.js";
import type { ProviderAdapter } from "../providers/types.js";
import { isRepeating, type TurnRecord } from "./stuckDetection.js";

const DEFAULT_TURN_BUDGET = 8;

const nextActionSchema = z.object({ toolCall: toolCallSchema });

export interface StepResult {
  verdict: StepVerdict;
  confidence: number;
  confidenceReason: string;
  turns: TurnRecord[];
}

export interface RunStepOptions {
  /** The atomic checklist step being executed, e.g. one line from a generated checklist. */
  instruction: string;
  page: Page;
  /** Injected explicitly — never a module-level singleton — so tests supply a FakeProvider. */
  provider: ProviderAdapter;
  turnBudget?: number;
}

/**
 * Runs one checklist step to a verdict: on each turn, asks the provider for the next
 * tool call, executes it, and checks for repetition (design §6.1) before spending the
 * rest of the turn budget. A verdict only counts once `assert_condition` is called,
 * which the tool schema forces to carry a confidence score and evidence-citing reason
 * on both pass and fail (design §6.2).
 */
export async function runStep(options: RunStepOptions): Promise<StepResult> {
  const turnBudget = options.turnBudget ?? DEFAULT_TURN_BUDGET;
  const history: TurnRecord[] = [];

  for (let turn = 0; turn < turnBudget; turn += 1) {
    const { object } = await options.provider.generateObject({
      systemPrompt:
        "You are executing one checklist step in a browser test via tool calls. Decide the single " +
        "next tool call. Before calling assert_condition, explicitly cite the evidence you actually " +
        "observed that supports the verdict you are about to reach.",
      prompt: buildPrompt(options.instruction, history),
      schema: nextActionSchema,
    });

    const call: ToolCall = object.toolCall;
    const result = await executeTool(options.page, call);
    history.push({ call, observation: result.observation });

    if (isRepeating(history)) {
      return {
        verdict: "blocked",
        confidence: 1,
        confidenceReason: "I appear to be repeating the same action with no change in observation.",
        turns: history,
      };
    }

    if (result.requiresConfirmation) {
      return {
        verdict: "blocked",
        confidence: 1,
        confidenceReason: `Awaiting tester response: ${result.observation}`,
        turns: history,
      };
    }

    if (result.verdict) {
      return {
        verdict: result.verdict.status,
        confidence: result.verdict.confidence,
        confidenceReason: result.verdict.reason,
        turns: history,
      };
    }
  }

  return {
    verdict: "blocked",
    confidence: 1,
    confidenceReason: `Turn budget of ${turnBudget} exhausted without reaching a verdict.`,
    turns: history,
  };
}

function buildPrompt(instruction: string, history: TurnRecord[]): string {
  const historyText = history
    .map((turn, index) => `Turn ${index + 1}: called ${turn.call.tool} -> observed: ${turn.observation}`)
    .join("\n");
  return `Checklist step: ${instruction}\n\nHistory so far:\n${historyText || "(no turns yet)"}`;
}
