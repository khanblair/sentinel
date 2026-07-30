import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { checkDatabaseConnection } from "../db/client.js";
import { ProjectRepository } from "../db/repositories/projectRepository.js";
import { SuiteRepository } from "../db/repositories/suiteRepository.js";
import { TestCaseRepository } from "../db/repositories/testCaseRepository.js";
import { EnvironmentRepository } from "../db/repositories/environmentRepository.js";
import { ProviderConfigRepository } from "../db/repositories/providerConfigRepository.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerSuiteRoutes } from "./routes/suites.js";
import { registerTestCaseRoutes } from "./routes/testCases.js";
import { registerEnvironmentRoutes } from "./routes/environments.js";
import { registerProviderConfigRoutes } from "./routes/providerConfigs.js";

export interface BuildAppOptions {
  prisma: PrismaClient;
  encryptionKey: Buffer;
  logger?: boolean;
}

/**
 * Pure app construction, no port binding — lets tests exercise real routes against a
 * real (test) database via Fastify's `.inject()`, with no network socket involved.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { prisma, encryptionKey } = options;
  const app = Fastify({ logger: options.logger ?? true });

  app.get("/health", async (_request, reply) => {
    const dbOk = await checkDatabaseConnection(prisma);
    if (!dbOk) {
      return reply.status(503).send({ status: "error", db: "unreachable" });
    }
    return reply.send({ status: "ok", db: "connected" });
  });

  registerProjectRoutes(app, new ProjectRepository(prisma));
  registerSuiteRoutes(app, new SuiteRepository(prisma));
  registerTestCaseRoutes(app, new TestCaseRepository(prisma));
  registerEnvironmentRoutes(app, new EnvironmentRepository(prisma));
  registerProviderConfigRoutes(app, new ProviderConfigRepository(prisma, encryptionKey));

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({ status: "error", message: "internal server error" });
  });

  return app;
}
