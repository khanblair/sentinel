import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ModelInfo, Provider } from "@sentinel/shared";
import type { ProviderConfigRepository } from "../../db/repositories/providerConfigRepository.js";
import { NotFoundError } from "../../errors.js";
import { createProviderAdapter } from "../../providers/aiSdkProvider.js";
import { listModels } from "../../providers/listModels.js";
import { sendErrorResponse } from "./helpers.js";

const createSchema = z.object({
  provider: z.enum(["claude", "deepseek", "gemini", "openai", "openrouter"]),
  apiKey: z.string().min(1),
  label: z.string().nullable().optional(),
});

/** Cheapest widely-available chat model per provider, used only to confirm the
 * key authenticates — never for real test runs (those choose their own model). */
const TEST_CONNECTION_MODEL: Record<Provider, string> = {
  claude: "claude-3-5-haiku-20241022",
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
};

/** Never echo the raw provider error back to the client — SDK error messages can
 * include request/response bodies, and we'd rather under-inform than leak anything
 * key-adjacent. Bucket into a small set of actionable categories instead. */
export function describeConnectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("401") || message.includes("unauthorized") || message.includes("invalid") || message.includes("api key")) {
    return "The API key was rejected — check that it's correct and active.";
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return "The provider rate-limited this request. The key may still be valid.";
  }
  if (message.includes("fetch failed") || message.includes("network") || message.includes("enotfound")) {
    return "Could not reach the provider — check your network connection.";
  }
  return "Connection failed — the provider rejected the request.";
}

const MODEL_LIST_TTL_MS = 60 * 60 * 1000; // model lists don't change minute to minute

export function registerProviderConfigRoutes(app: FastifyInstance, repo: ProviderConfigRepository): void {
  // Scoped to this app instance (not a module-level singleton) so tests that build
  // separate apps never leak cached models between them. Cleared for an id whenever
  // that config is deleted, so a re-added key with a recycled row id can't read stale
  // models from a config it has nothing to do with.
  const modelListCache = new Map<string, { fetchedAt: number; models: ModelInfo[] }>();

  app.post("/api/provider-configs", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ status: "error", message: parsed.error.message });
    }
    try {
      return reply.status(201).send(await repo.create(parsed.data));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  app.get("/api/provider-configs", async (_request, reply) => reply.send(await repo.list()));

  app.delete<{ Params: { id: string } }>("/api/provider-configs/:id", async (request, reply) => {
    try {
      await repo.delete(request.params.id);
      modelListCache.delete(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  /** Backs the model dropdown on run-trigger forms — always the provider's own live
   * list, never a hardcoded one (see listModels.ts). Cached briefly per config since
   * a form re-render shouldn't re-hit the provider's API on every keystroke. */
  app.get<{ Params: { id: string } }>("/api/provider-configs/:id/models", async (request, reply) => {
    try {
      const cached = modelListCache.get(request.params.id);
      if (cached && Date.now() - cached.fetchedAt < MODEL_LIST_TTL_MS) {
        return reply.send(cached.models);
      }
      const { provider, apiKey } = await repo.getDecryptedApiKey(request.params.id);
      const models = await listModels(provider, apiKey);
      modelListCache.set(request.params.id, { fetchedAt: Date.now(), models });
      return reply.send(models);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return sendErrorResponse(reply, error);
      }
      // Never let a raw provider error body reach the client — reuses the same
      // bucketing describeConnectionFailure applies to "test connection" (401 bodies
      // can echo request details back).
      return reply.status(502).send({ status: "error", message: describeConnectionFailure(error) });
    }
  });

  app.post<{ Params: { id: string } }>("/api/provider-configs/:id/test", async (request, reply) => {
    try {
      const { provider, apiKey } = await repo.getDecryptedApiKey(request.params.id);
      const adapter = createProviderAdapter(provider, apiKey, TEST_CONNECTION_MODEL[provider]);
      await adapter.generateText({ prompt: "Reply with OK." });
      return reply.send({ ok: true, message: "Connection successful." });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return sendErrorResponse(reply, error);
      }
      return reply.send({ ok: false, message: describeConnectionFailure(error) });
    }
  });
}
