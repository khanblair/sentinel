import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ProjectRepository } from "../../db/repositories/projectRepository.js";
import { sendErrorResponse } from "./helpers.js";

const createSchema = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  defaultAssistantId: z.string().nullable().optional(),
});

export function registerProjectRoutes(app: FastifyInstance, repo: ProjectRepository): void {
  app.post("/api/projects", async (request, reply) => {
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

  app.get("/api/projects", async (_request, reply) => reply.send(await repo.list()));

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    try {
      return reply.send(await repo.getById(request.params.id));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ status: "error", message: parsed.error.message });
    }
    try {
      return reply.send(await repo.update(request.params.id, parsed.data));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    try {
      await repo.delete(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
