import { generateObject, generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { z } from "zod";
import type { Provider } from "@sentinel/shared";
import { ValidationError } from "../errors.js";
import type {
  GenerateObjectRequest,
  GenerateObjectResult,
  GenerateTextRequest,
  GenerateTextResult,
  ProviderAdapter,
} from "./types.js";

/** True for the specific failure where a provider rejects a forced tool-call because
 * the target model is always-reasoning (e.g. DeepSeek's reasoner-class models, OpenAI's
 * o-series): generateObject's default 'auto' mode picks 'tool' mode for OpenAI-compatible
 * models, which these reject outright. Narrow on purpose — anything else (auth, rate
 * limit, network) should fail immediately rather than silently retrying. */
function isToolChoiceIncompatibleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("tool_choice") && (message.includes("thinking") || message.includes("reasoning"));
}

// Vercel AI SDK gives Claude/OpenAI/Gemini native adapters, and covers DeepSeek/OpenRouter
// through @ai-sdk/openai's OpenAI-compatible mode — one client shape for all five providers
// instead of a hand-rolled HTTP client per provider (design §7).
function resolveLanguageModel(provider: Provider, apiKey: string, model: string) {
  switch (provider) {
    case "claude":
      return createAnthropic({ apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "deepseek":
      return createOpenAI({ apiKey, baseURL: "https://api.deepseek.com/v1" })(model);
    case "openrouter":
      return createOpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" })(model);
    default: {
      const exhaustive: never = provider;
      throw new ValidationError(`Unknown provider "${String(exhaustive)}"`);
    }
  }
}

export function createProviderAdapter(provider: Provider, apiKey: string, model: string): ProviderAdapter {
  if (!apiKey.trim()) {
    throw new ValidationError(`API key is required to create a ${provider} provider adapter`);
  }
  const languageModel = resolveLanguageModel(provider, apiKey, model);

  return {
    provider,
    model,

    async generateText(request: GenerateTextRequest): Promise<GenerateTextResult> {
      const result = await generateText({
        model: languageModel,
        system: request.systemPrompt,
        prompt: request.prompt,
      });
      return {
        text: result.text,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        },
      };
    },

    async generateObject<Schema extends z.ZodTypeAny>(
      request: GenerateObjectRequest<Schema>,
    ): Promise<GenerateObjectResult<z.infer<Schema>>> {
      async function run(mode?: "json") {
        const result = await generateObject({
          model: languageModel,
          system: request.systemPrompt,
          prompt: request.prompt,
          schema: request.schema,
          mode,
        });
        return {
          object: result.object,
          usage: {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
          },
        };
      }

      try {
        return await run();
      } catch (error) {
        if (!isToolChoiceIncompatibleError(error)) {
          throw error;
        }
        // 'auto' mode picked forced tool-calling, which this always-reasoning model
        // rejects. Retry once with prompt-injected JSON mode instead of a tool call.
        try {
          return await run("json");
        } catch {
          throw new ValidationError(
            `Model "${model}" (${provider}) does not support structured output — it rejects forced tool calls (likely an always-reasoning model) and the JSON-mode fallback also failed. Pick a different model.`,
          );
        }
      }
    },
  };
}
