import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ValidationError } from "../errors.js";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});

import { generateObject } from "ai";
import { createProviderAdapter } from "./aiSdkProvider.js";

const generateObjectMock = vi.mocked(generateObject);

const TOOL_CHOICE_ERROR = new Error("Thinking mode does not support this tool_choice");
const SCHEMA = z.object({ ok: z.boolean() });
const OK_RESULT = { object: { ok: true }, usage: { promptTokens: 10, completionTokens: 5 } };

/**
 * generateObject's default 'auto' mode picks forced tool-calling for OpenAI-compatible
 * models, which always-reasoning models (DeepSeek's reasoner-class, OpenAI's o-series)
 * reject outright — the bug behind "Thinking mode does not support this tool_choice".
 * These tests exercise the retry-with-mode:'json' fallback in aiSdkProvider.ts without
 * any network I/O: only the 'ai' package's generateObject is mocked, so model
 * construction (createOpenAI/createAnthropic/etc.) still runs for real — it never
 * touches the network on its own, only generateObject/generateText do.
 */
describe("aiSdkProvider generateObject retry", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("returns the result directly when the first call succeeds", async () => {
    generateObjectMock.mockResolvedValueOnce(OK_RESULT as never);
    const adapter = createProviderAdapter("deepseek", "test-key", "deepseek-v4-pro");

    const result = await adapter.generateObject({ prompt: "hi", schema: SCHEMA });

    expect(result.object).toEqual({ ok: true });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock.mock.calls[0]?.[0]).not.toHaveProperty("mode", "json");
  });

  it("retries once with mode:'json' when the model rejects forced tool_choice, and succeeds", async () => {
    generateObjectMock.mockRejectedValueOnce(TOOL_CHOICE_ERROR);
    generateObjectMock.mockResolvedValueOnce(OK_RESULT as never);
    const adapter = createProviderAdapter("deepseek", "test-key", "deepseek-v4-pro");

    const result = await adapter.generateObject({ prompt: "hi", schema: SCHEMA });

    expect(result.object).toEqual({ ok: true });
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(generateObjectMock.mock.calls[1]?.[0]).toMatchObject({ mode: "json" });
  });

  it("throws a clear ValidationError (not the raw provider error) when the json-mode retry also fails", async () => {
    generateObjectMock.mockRejectedValue(TOOL_CHOICE_ERROR);
    const adapter = createProviderAdapter("deepseek", "test-key", "deepseek-v4-pro");

    await expect(adapter.generateObject({ prompt: "hi", schema: SCHEMA })).rejects.toThrow(ValidationError);
    await expect(adapter.generateObject({ prompt: "hi", schema: SCHEMA })).rejects.toThrow(/deepseek-v4-pro/);
    expect(generateObjectMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry on an unrelated error (e.g. an auth failure)", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("401 Unauthorized"));
    const adapter = createProviderAdapter("deepseek", "test-key", "deepseek-v4-pro");

    await expect(adapter.generateObject({ prompt: "hi", schema: SCHEMA })).rejects.toThrow("401 Unauthorized");
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });
});
