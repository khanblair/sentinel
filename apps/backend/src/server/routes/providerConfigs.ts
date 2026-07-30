import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ProviderConfigRepository } from "../../db/repositories/providerConfigRepository.js";
import { sendErrorResponse } from "./helpers.js";

const createSchema = z.object({
  provider: z.enum(["claude", "deepseek", "gemini", "openai", "openrouter"]),
  apiKey: z.string().min(1),
  label: z.string().nullable().optional(),
});

export function registerProviderConfigRoutes(app: FastifyInstance, repo: ProviderConfigRepository): void {
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
      return reply.status(204).send();
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
