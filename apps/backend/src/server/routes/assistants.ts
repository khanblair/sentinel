import type { FastifyInstance } from "fastify";
import type { AssistantRepository } from "../../db/repositories/assistantRepository.js";

export function registerAssistantRoutes(app: FastifyInstance, repo: AssistantRepository): void {
  app.get("/api/assistants", async (_request, reply) => reply.send(await repo.list()));
}
