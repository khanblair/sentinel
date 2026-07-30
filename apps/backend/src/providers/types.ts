import type { z } from "zod";
import type { Provider } from "@sentinel/shared";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface GenerateTextRequest {
  systemPrompt?: string;
  prompt: string;
}

export interface GenerateTextResult {
  text: string;
  usage: TokenUsage;
}

export interface GenerateObjectRequest<Schema extends z.ZodTypeAny> {
  systemPrompt?: string;
  prompt: string;
  schema: Schema;
}

export interface GenerateObjectResult<T> {
  object: T;
  usage: TokenUsage;
}

/**
 * Everything that talks to an AI provider (checklist generation, judgment) depends on
 * this interface, injected explicitly — never a module-level singleton and never a
 * direct `process.env` read — so tests can supply a FakeProvider with zero network I/O.
 */
export interface ProviderAdapter {
  readonly provider: Provider;
  readonly model: string;
  generateText(request: GenerateTextRequest): Promise<GenerateTextResult>;
  generateObject<Schema extends z.ZodTypeAny>(
    request: GenerateObjectRequest<Schema>,
  ): Promise<GenerateObjectResult<z.infer<Schema>>>;
}
