import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ScheduledJobRepository } from "../../db/repositories/scheduledJobRepository.js";
import { sendErrorResponse } from "./helpers.js";

const createSchema = z.object({
  scheduleType: z.enum(["cron", "interval", "once"]),
  scheduleExpression: z.string().min(1),
  timezone: z.string().optional(),
  mode: z.enum(["interactive", "full_auto"]).optional(),
  assistantId: z.string().min(1),
  providerConfigId: z.string().min(1),
  model: z.string().min(1),
  environmentId: z.string().nullable().optional(),
});

export function registerScheduledJobRoutes(app: FastifyInstance, repo: ScheduledJobRepository): void {
  app.post<{ Params: { suiteId: string } }>(
    "/api/suites/:suiteId/scheduled-jobs",
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

  app.get<{ Params: { suiteId: string } }>(
    "/api/suites/:suiteId/scheduled-jobs",
    async (request, reply) => reply.send(await repo.listBySuite(request.params.suiteId)),
  );

  app.post<{ Params: { id: string }; Body: { isActive: boolean } }>(
    "/api/scheduled-jobs/:id/active",
    async (request, reply) => {
      const parsed = z.object({ isActive: z.boolean() }).safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ status: "error", message: parsed.error.message });
      }
      try {
        return reply.send(await repo.setActive(request.params.id, parsed.data.isActive));
      } catch (error) {
        return sendErrorResponse(reply, error);
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/api/scheduled-jobs/:id", async (request, reply) => {
    try {
      await repo.delete(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
