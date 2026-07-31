import { z } from "zod";
import type { ProviderAdapter, TokenUsage } from "../providers/types.js";
import { withPersonaPrefix } from "../orchestrator/systemPrompt.js";

const checklistSchema = z.object({
  steps: z.array(z.string().min(1)).min(1),
});

export interface ChecklistResult {
  steps: string[];
  usage: TokenUsage;
}

export interface GenerateChecklistFromTestCaseInput {
  provider: ProviderAdapter;
  expectedResult: string;
  steps: string;
  urlPath: string;
  /** Composed Assistant persona + Rules (see orchestrator/systemPrompt.ts) — omitted
   * for callers that don't yet have an Assistant/Rules context. */
  personaPrefix?: string;
}

export interface GenerateChecklistFromInstructionInput {
  provider: ProviderAdapter;
  url: string;
  instruction: string;
  personaPrefix?: string;
}

/** Structured test case path: decompose Steps + Expected Result into atomic checks. */
export async function generateChecklistFromTestCase(
  input: GenerateChecklistFromTestCaseInput,
): Promise<ChecklistResult> {
  const { object, usage } = await input.provider.generateObject({
    systemPrompt: withPersonaPrefix(
      input.personaPrefix,
      "Decompose a QA test case's steps and expected result into an ordered list of atomic, " +
        "independently checkable steps. Each step should be verifiable with a single tool call.",
    ),
    prompt: `URL path: ${input.urlPath}\nSteps: ${input.steps}\nExpected result: ${input.expectedResult}`,
    schema: checklistSchema,
  });
  return { steps: object.steps, usage };
}

/** Ad-hoc path (design §4.4/§5.2): decompose a URL + free-text intent instead of a
 * pre-authored test case, using the exact same downstream execution engine. */
export async function generateChecklistFromInstruction(
  input: GenerateChecklistFromInstructionInput,
): Promise<ChecklistResult> {
  const { object, usage } = await input.provider.generateObject({
    systemPrompt: withPersonaPrefix(
      input.personaPrefix,
      "Decompose a free-text testing instruction against a URL into an ordered list of atomic, " +
        "independently checkable steps. Each step should be verifiable with a single tool call.",
    ),
    prompt: `URL: ${input.url}\nInstruction: ${input.instruction}`,
    schema: checklistSchema,
  });
  return { steps: object.steps, usage };
}
