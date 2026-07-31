import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RuleRepository } from "../../db/repositories/ruleRepository.js";
import { sendErrorResponse } from "./helpers.js";

const createSchema = z.object({
  scope: z.enum(["global", "project"]),
  projectId: z.string().nullable().optional(),
  text: z.string().min(1),
});

export function registerRuleRoutes(app: FastifyInstance, repo: RuleRepository): void {
  app.post("/api/rules", async (request, reply) => {
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

  app.get("/api/rules", async (_request, reply) => reply.send(await repo.listGlobal()));

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/rules",
    async (request, reply) => reply.send(await repo.listByProject(request.params.projectId)),
  );

  app.delete<{ Params: { id: string } }>("/api/rules/:id", async (request, reply) => {
    try {
      await repo.delete(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
