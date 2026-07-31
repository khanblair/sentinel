import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AssistantRepository } from "../../db/repositories/assistantRepository.js";
import { sendErrorResponse } from "./helpers.js";

const createSchema = z.object({
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
  defaultSkills: z.array(z.string()).optional(),
  projectId: z.string().nullable().optional(),
});

export function registerAssistantRoutes(app: FastifyInstance, repo: AssistantRepository): void {
  app.get("/api/assistants", async (_request, reply) => reply.send(await repo.list()));

  app.post("/api/assistants", async (request, reply) => {
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

  app.delete<{ Params: { id: string } }>("/api/assistants/:id", async (request, reply) => {
    try {
      await repo.delete(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
