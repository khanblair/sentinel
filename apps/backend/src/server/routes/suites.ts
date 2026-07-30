import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SuiteRepository } from "../../db/repositories/suiteRepository.js";
import { sendErrorResponse } from "./helpers.js";

const createSchema = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial();

export function registerSuiteRoutes(app: FastifyInstance, repo: SuiteRepository): void {
  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/suites",
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

  app.get<{ Params: { projectId: string }; Querystring: { includeArchived?: string } }>(
    "/api/projects/:projectId/suites",
    async (request, reply) => {
      const includeArchived = request.query.includeArchived === "true";
      return reply.send(await repo.listByProject(request.params.projectId, { includeArchived }));
    },
  );

  app.get<{ Params: { id: string } }>("/api/suites/:id", async (request, reply) => {
    try {
      return reply.send(await repo.getById(request.params.id));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>("/api/suites/:id", async (request, reply) => {
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

  app.post<{ Params: { id: string } }>("/api/suites/:id/archive", async (request, reply) => {
    try {
      return reply.send(await repo.archive(request.params.id));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>("/api/suites/:id/clone", async (request, reply) => {
    try {
      return reply.status(201).send(await repo.clone(request.params.id));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
