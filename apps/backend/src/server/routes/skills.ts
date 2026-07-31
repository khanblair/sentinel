import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SkillRepository } from "../../db/repositories/skillRepository.js";
import { sendErrorResponse } from "./helpers.js";

const createSchema = z.object({
  name: z.string().min(1),
  definition: z.string().min(1),
});

export function registerSkillRoutes(app: FastifyInstance, repo: SkillRepository): void {
  app.post("/api/skills", async (request, reply) => {
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

  app.get("/api/skills", async (_request, reply) => reply.send(await repo.list()));

  app.delete<{ Params: { id: string } }>("/api/skills/:id", async (request, reply) => {
    try {
      await repo.delete(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
