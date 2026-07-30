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
      const result = await generateObject({
        model: languageModel,
        system: request.systemPrompt,
        prompt: request.prompt,
        schema: request.schema,
      });
      return {
        object: result.object,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        },
      };
    },
  };
}
