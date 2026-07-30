import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { TestCaseRepository } from "../../db/repositories/testCaseRepository.js";
import { sendErrorResponse } from "./helpers.js";

const preconditionType = z.enum(["auto", "manual"]);

const createSchema = z.object({
  module: z.string().min(1),
  subModule: z.string().nullable().optional(),
  title: z.string().min(1),
  priority: z.string().min(1),
  urlPath: z.string().min(1),
  precondition: z.string().nullable().optional(),
  preconditionType: preconditionType.optional(),
  steps: z.string().min(1),
  expectedResult: z.string().min(1),
  tags: z.array(z.string()).optional(),
  owner: z.string().nullable().optional(),
  linkedIssueUrl: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial();

export function registerTestCaseRoutes(app: FastifyInstance, repo: TestCaseRepository): void {
  app.post<{ Params: { suiteId: string } }>(
    "/api/suites/:suiteId/test-cases",
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ status: "error", message: parsed.error.message });
      }
      try {
        return reply
          .status(201)
          .send(await repo.create({ ...parsed.data, suiteId: request.params.suiteId }));
      } catch (error) {
        return sendErrorResponse(reply, error);
      }
    },
  );

  app.get<{ Params: { suiteId: string }; Querystring: { includeArchived?: string } }>(
    "/api/suites/:suiteId/test-cases",
    async (request, reply) => {
      const includeArchived = request.query.includeArchived === "true";
      return reply.send(await repo.listBySuite(request.params.suiteId, { includeArchived }));
    },
  );

  app.get<{ Params: { id: string } }>("/api/test-cases/:id", async (request, reply) => {
    try {
      return reply.send(await repo.getById(request.params.id));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>("/api/test-cases/:id", async (request, reply) => {
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

  app.post<{ Params: { id: string } }>("/api/test-cases/:id/archive", async (request, reply) => {
    try {
      return reply.send(await repo.archive(request.params.id));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>("/api/test-cases/:id/clone", async (request, reply) => {
    try {
      return reply.status(201).send(await repo.clone(request.params.id));
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
