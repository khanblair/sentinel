import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listModels } from "./listModels.js";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

/**
 * Fixtures below match the exact response shapes documented at
 * https://platform.claude.com/docs/en/api/models-list,
 * https://ai.google.dev/api/models,
 * https://openrouter.ai/docs/guides/overview/models, and DeepSeek's OpenAI-compatible
 * /v1/models — fetched and verified against primary sources while building this
 * feature. What's NOT verified here is the real network round trip: a schema drift on
 * the provider's side would only surface against a real API key.
 */
describe("listModels", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes Claude's response, including the thinking/structured-outputs capability", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "claude-opus-4-6",
            display_name: "Claude Opus 4.6",
            max_input_tokens: 200000,
            capabilities: { structured_outputs: { supported: true }, thinking: { supported: true } },
          },
        ],
        first_id: "a",
        last_id: "a",
        has_more: false,
      }),
    );

    const models = await listModels("claude", "test-key");

    expect(models).toEqual([
      {
        id: "claude-opus-4-6",
        label: "Claude Opus 4.6",
        description: null,
        contextWindow: 200000,
        supportsTools: true,
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.anthropic.com/v1/models");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });

  it("treats a placeholder max_input_tokens of 0 as unknown, not a real context window", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: "claude-x", display_name: "X", max_input_tokens: 0, capabilities: {} }],
        first_id: "a",
        last_id: "a",
        has_more: false,
      }),
    );
    const [model] = await listModels("claude", "test-key");
    expect(model?.contextWindow).toBeNull();
    expect(model?.supportsTools).toBeNull();
  });

  it("normalizes OpenAI's bare model list, sorted, with non-chat families excluded", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: "gpt-5" },
          { id: "text-embedding-3-large" },
          { id: "whisper-1" },
          { id: "gpt-4o-mini" },
        ],
      }),
    );

    const models = await listModels("openai", "test-key");

    expect(models.map((m) => m.id)).toEqual(["gpt-4o-mini", "gpt-5"]);
    expect(models[0]).toEqual({
      id: "gpt-4o-mini",
      label: null,
      description: null,
      contextWindow: null,
      supportsTools: null,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  it("normalizes Gemini's response and filters to generateContent-capable models", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        models: [
          {
            name: "models/gemini-2.5-flash",
            baseModelId: "gemini-2.5-flash",
            displayName: "Gemini 2.5 Flash",
            description: "Fast multimodal model",
            inputTokenLimit: 1000000,
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/embedding-001",
            displayName: "Embedding 001",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
    );

    const models = await listModels("gemini", "test-key");

    expect(models).toEqual([
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Fast multimodal model",
        contextWindow: 1000000,
        supportsTools: null,
      },
    ]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("generativelanguage.googleapis.com/v1beta/models");
    expect(url).toContain("key=test-key");
  });

  it("normalizes DeepSeek's bare model list, sorted", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ object: "list", data: [{ id: "deepseek-v4-pro" }, { id: "deepseek-chat" }] }),
    );

    const models = await listModels("deepseek", "test-key");

    expect(models.map((m) => m.id)).toEqual(["deepseek-chat", "deepseek-v4-pro"]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://api.deepseek.com/v1/models");
  });

  it("normalizes OpenRouter's response, requesting the tools-capable filter server-side", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "openai/gpt-4o-mini",
            name: "GPT-4o Mini",
            description: "Fast, affordable model",
            context_length: 128000,
            supported_parameters: ["tools", "temperature"],
          },
        ],
        total_count: 1,
        links: { next: null },
      }),
    );

    const models = await listModels("openrouter", "test-key");

    expect(models).toEqual([
      {
        id: "openai/gpt-4o-mini",
        label: "GPT-4o Mini",
        description: "Fast, affordable model",
        contextWindow: 128000,
        supportsTools: true,
      },
    ]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("supported_parameters=tools");
  });

  it("throws (rather than returning an empty list) when the provider rejects the request", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid_api_key" }, { ok: false, status: 401 }));
    await expect(listModels("openai", "bad-key")).rejects.toThrow(/401/);
  });
});
