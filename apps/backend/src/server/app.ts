import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { PrismaClient } from "@prisma/client";
import type { ServerMessage } from "@sentinel/shared";
import { checkDatabaseConnection } from "../db/client.js";
import { ProjectRepository } from "../db/repositories/projectRepository.js";
import { SuiteRepository } from "../db/repositories/suiteRepository.js";
import { TestCaseRepository } from "../db/repositories/testCaseRepository.js";
import { EnvironmentRepository } from "../db/repositories/environmentRepository.js";
import { ProviderConfigRepository } from "../db/repositories/providerConfigRepository.js";
import { AssistantRepository } from "../db/repositories/assistantRepository.js";
import type { WsPromptBroker } from "../ws/promptBroker.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerSuiteRoutes } from "./routes/suites.js";
import { registerTestCaseRoutes } from "./routes/testCases.js";
import { registerEnvironmentRoutes } from "./routes/environments.js";
import { registerProviderConfigRoutes } from "./routes/providerConfigs.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerAssistantRoutes } from "./routes/assistants.js";

export interface BuildAppOptions {
  prisma: PrismaClient;
  encryptionKey: Buffer;
  /** Publishes a message to every connected WebSocket client — shared with the
   * WsPromptBroker so run:prompt / run:update / run:step all flow through one path. */
  broadcast: (message: ServerMessage) => void;
  promptBroker: WsPromptBroker;
  logger?: boolean;
}

/**
 * Pure app construction, no port binding — lets tests exercise real routes against a
 * real (test) database via Fastify's `.inject()`, with no network socket involved.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { prisma, encryptionKey, broadcast, promptBroker } = options;
  const app = Fastify({ logger: options.logger ?? true });

  // The renderer is never same-origin as this server: it loads from file://, a
  // packaged app:// scheme, or the Vite dev server — all different origins from
  // http://127.0.0.1:4317. Permissive here is deliberate (v1 is loopback-only,
  // single-user, local-first per design §10) — tighten this when the network-
  // addressable hosted mode (§7) introduces a real multi-origin threat model.
  void app.register(cors, { origin: true });

  app.get("/health", async (_request, reply) => {
    const dbOk = await checkDatabaseConnection(prisma);
    if (!dbOk) {
      return reply.status(503).send({ status: "error", db: "unreachable" });
    }
    return reply.send({ status: "ok", db: "connected" });
  });

  const providerConfigRepo = new ProviderConfigRepository(prisma, encryptionKey);

  registerProjectRoutes(app, new ProjectRepository(prisma));
  registerSuiteRoutes(app, new SuiteRepository(prisma));
  registerTestCaseRoutes(app, new TestCaseRepository(prisma));
  registerEnvironmentRoutes(app, new EnvironmentRepository(prisma));
  registerProviderConfigRoutes(app, providerConfigRepo);
  registerRunRoutes(app, { prisma, providerConfigRepo, promptBroker, broadcast });
  registerAssistantRoutes(app, new AssistantRepository(prisma));

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({ status: "error", message: "internal server error" });
  });

  return app;
}
