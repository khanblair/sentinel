import type { ModelInfo, Provider } from "@sentinel/shared";
import { ValidationError } from "../errors.js";

/**
 * Live per-provider model lists — never hardcoded. Model availability and IDs change
 * too often (and getting one wrong is exactly the failure mode this exists to prevent:
 * a user picking a plausible-looking model name that doesn't actually work). Every
 * field beyond `id` is populated only when the provider's own response actually
 * includes it; nothing here is synthesized or guessed.
 */
export async function listModels(provider: Provider, apiKey: string): Promise<ModelInfo[]> {
  switch (provider) {
    case "claude":
      return listClaudeModels(apiKey);
    case "openai":
      return listOpenAIModels(apiKey);
    case "gemini":
      return listGeminiModels(apiKey);
    case "deepseek":
      return listDeepSeekModels(apiKey);
    case "openrouter":
      return listOpenRouterModels(apiKey);
    default: {
      const exhaustive: never = provider;
      throw new ValidationError(`Unknown provider "${String(exhaustive)}"`);
    }
  }
}

async function requestFailure(response: Response, providerLabel: string): Promise<Error> {
  const body = await response.text().catch(() => "");
  return new Error(`${providerLabel} models request failed: ${response.status} ${body}`.trim());
}

async function listClaudeModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch("https://api.anthropic.com/v1/models?limit=1000", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  if (!response.ok) {
    throw await requestFailure(response, "Anthropic");
  }
  const body = (await response.json()) as {
    data: Array<{
      id: string;
      display_name?: string;
      max_input_tokens?: number;
      capabilities?: { structured_outputs?: { supported?: boolean } };
    }>;
  };
  return body.data.map((m) => ({
    id: m.id,
    label: m.display_name ?? null,
    description: null,
    contextWindow: typeof m.max_input_tokens === "number" && m.max_input_tokens > 0 ? m.max_input_tokens : null,
    supportsTools:
      typeof m.capabilities?.structured_outputs?.supported === "boolean"
        ? m.capabilities.structured_outputs.supported
        : null,
  }));
}

// OpenAI's /v1/models has no capability flags at all — every non-`id` field is null.
// It also lists every model family the account can see, including ones this app can
// never use for chat (embeddings, tts, whisper, moderation, image generation). There's
// no capability field to filter on, so this excludes those by well-established, stable
// naming convention rather than guessing at current chat-model IDs.
const OPENAI_NON_CHAT_PATTERN = /embedding|whisper|tts|dall-e|moderation|davinci-002|babbage/i;

async function listOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw await requestFailure(response, "OpenAI");
  }
  const body = (await response.json()) as { data: Array<{ id: string }> };
  return body.data
    .filter((m) => !OPENAI_NON_CHAT_PATTERN.test(m.id))
    .map((m) => ({ id: m.id, label: null, description: null, contextWindow: null, supportsTools: null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function listGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) {
    throw await requestFailure(response, "Gemini");
  }
  const body = (await response.json()) as {
    models: Array<{
      name: string;
      baseModelId?: string;
      displayName?: string;
      description?: string;
      inputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    }>;
  };
  return body.models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({
      id: m.baseModelId ?? m.name.replace(/^models\//, ""),
      label: m.displayName ?? null,
      description: m.description ?? null,
      contextWindow: typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : null,
      supportsTools: null,
    }));
}

async function listDeepSeekModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch("https://api.deepseek.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw await requestFailure(response, "DeepSeek");
  }
  const body = (await response.json()) as { data: Array<{ id: string }> };
  return body.data
    .map((m) => ({ id: m.id, label: null, description: null, contextWindow: null, supportsTools: null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function listOpenRouterModels(apiKey: string): Promise<ModelInfo[]> {
  // OpenRouter routes ~400 models; ?supported_parameters=tools is the provider's own
  // server-side filter for "can this model take a forced tool call" — this app cannot
  // function with a model that can't, so this is a real capability filter, not a
  // hand-rolled allowlist.
  const response = await fetch("https://openrouter.ai/api/v1/models?supported_parameters=tools", {
    headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!response.ok) {
    throw await requestFailure(response, "OpenRouter");
  }
  const body = (await response.json()) as {
    data: Array<{
      id: string;
      name?: string;
      description?: string;
      context_length?: number;
      supported_parameters?: string[];
    }>;
  };
  return body.data.map((m) => ({
    id: m.id,
    label: m.name ?? null,
    description: m.description ?? null,
    contextWindow: typeof m.context_length === "number" ? m.context_length : null,
    supportsTools: m.supported_parameters ? m.supported_parameters.includes("tools") : null,
  }));
}
