import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EnvironmentRepository } from "../../db/repositories/environmentRepository.js";
import { sendErrorResponse } from "./helpers.js";

const createSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  credentialsProfile: z.record(z.string()).nullable().optional(),
});

const updateSchema = createSchema.partial();

export function registerEnvironmentRoutes(app: FastifyInstance, repo: EnvironmentRepository): void {
  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/environments",
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ status: "error", message: parsed.error.message });
      }
      try {
        return reply
          .status(201)
          .send(await repo.create({ ...parsed.data, projectId: request.params.projectId }));
      } catch (error) {
        return sendErrorResponse(reply, error);
      }
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/environments",
    async (request, reply) => reply.send(await repo.listByProject(request.params.projectId)),
  );

  app.get<{ Params: { id: string } }>("/api/environments/:id", async (request, reply) => {
    try {
      return reply.send(await repo.getById(request.params.id));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>("/api/environments/:id", async (request, reply) => {
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

  app.delete<{ Params: { id: string } }>("/api/environments/:id", async (request, reply) => {
    try {
      await repo.delete(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
