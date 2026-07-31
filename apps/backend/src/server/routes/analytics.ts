import type { FastifyInstance } from "fastify";
import type { AnalyticsRepository } from "../../analytics/repository.js";

export function registerAnalyticsRoutes(app: FastifyInstance, repo: AnalyticsRepository): void {
  app.get<{ Querystring: { limit?: string } }>("/api/runs/recent", async (request, reply) => {
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    return reply.send(await repo.recentRuns(limit && Number.isFinite(limit) ? limit : undefined));
  });

  app.get("/api/runs/count", async (_request, reply) => reply.send({ count: await repo.totalRunCount() }));

  app.get<{ Params: { suiteId: string } }>("/api/suites/:suiteId/runs", async (request, reply) =>
    reply.send(await repo.runsBySuite(request.params.suiteId)),
  );

  app.get<{ Params: { id: string } }>("/api/runs/:id", async (request, reply) => {
    const detail = await repo.runDetail(request.params.id);
    if (!detail) {
      return reply.status(404).send({ status: "error", message: `Run ${request.params.id} not found` });
    }
    return reply.send(detail);
  });

  app.get<{ Params: { suiteId: string } }>(
    "/api/suites/:suiteId/analytics/trend",
    async (request, reply) => reply.send(await repo.passFailTrend(request.params.suiteId)),
  );

  app.get<{ Params: { suiteId: string } }>(
    "/api/suites/:suiteId/analytics/flaky-cases",
    async (request, reply) => reply.send(await repo.flakyCases(request.params.suiteId)),
  );

  app.get<{ Params: { suiteId: string } }>(
    "/api/suites/:suiteId/analytics/usage",
    async (request, reply) => reply.send(await repo.usageBySuite(request.params.suiteId)),
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/analytics/heatmap",
    async (request, reply) => reply.send(await repo.moduleRiskHeatmap(request.params.projectId)),
  );
}
