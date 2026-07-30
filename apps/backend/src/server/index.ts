import { join } from "node:path";
import { WebSocketServer } from "ws";
import type { PrismaClient, ScheduledJob } from "@prisma/client";
import type { ServerMessage } from "@sentinel/shared";
import { createPlaywrightPageFactory } from "../automation/browserManager.js";
import { applyPendingMigrations } from "../db/applyMigrations.js";
import { createPrismaClient } from "../db/client.js";
import { ProviderConfigRepository } from "../db/repositories/providerConfigRepository.js";
import { seedBuiltInAssistants } from "../db/seedAssistants.js";
import { fullAutoResolver } from "../executionLoop/confirmation.js";
import { runSuite } from "../orchestrator/runSuite.js";
import { createProviderAdapter } from "../providers/aiSdkProvider.js";
import { startSchedulerLoop } from "../scheduler/schedulerLoop.js";
import { loadOrCreateEncryptionKey } from "../security/encryption.js";
import { attachConnectionHandler, broadcast as broadcastToClients } from "../ws/index.js";
import { WsPromptBroker } from "../ws/promptBroker.js";
import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? "127.0.0.1";

async function runScheduledJob(
  job: ScheduledJob,
  prisma: PrismaClient,
  providerConfigRepo: ProviderConfigRepository,
  broadcast: (message: ServerMessage) => void,
): Promise<void> {
  if (!job.suiteId) {
    console.error(`ScheduledJob ${job.id} has no suiteId — skipping`);
    return;
  }
  const { apiKey, provider: providerName } = await providerConfigRepo.getDecryptedApiKey(job.providerConfigId);
  const provider = createProviderAdapter(providerName, apiKey, job.model);

  // Scheduled runs default to Full-Auto (design §4.6) — nobody is present to answer
  // a pause-and-ask, so this never uses the interactive/WS-backed resolvers at all.
  await runSuite({
    prisma,
    suiteId: job.suiteId,
    assistantId: job.assistantId,
    environmentId: job.environmentId,
    mode: job.mode as "interactive" | "full_auto",
    provider,
    pageFactory: createPlaywrightPageFactory(),
    resolveConfirmation: fullAutoResolver,
    broadcast,
    trigger: "scheduled",
  });
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const encryptionKey = loadOrCreateEncryptionKey();
  // A packaged desktop app has no CLI step a user runs to migrate — resourcesPath
  // (an Electron-only process field, not in @types/node) is where extraResources
  // land once packaged; process.cwd() covers plain `pnpm dev`.
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const migrationsDir = resourcesPath
    ? join(resourcesPath, "backend", "prisma", "migrations")
    : join(process.cwd(), "prisma", "migrations");
  await applyPendingMigrations(prisma, migrationsDir);
  await seedBuiltInAssistants(prisma);

  // The WebSocketServer can't be constructed until after `app.listen()` gives us
  // `app.server`, but routes need a `broadcast` function to close over *before*
  // that — this box lets broadcast() be handed to buildApp immediately and start
  // actually reaching clients the moment the WS server exists a few lines later.
  const wssBox: { current: WebSocketServer | null } = { current: null };
  const broadcast = (message: ServerMessage): void => {
    if (wssBox.current) {
      broadcastToClients(wssBox.current, message);
    }
  };
  const promptBroker = new WsPromptBroker(broadcast);
  const providerConfigRepo = new ProviderConfigRepository(prisma, encryptionKey);

  const app = buildApp({ prisma, encryptionKey, broadcast, promptBroker });

  const address = await app.listen({ port: PORT, host: HOST });
  app.log.info(`Sentinel backend listening at ${address}`);

  const wss = new WebSocketServer({ server: app.server, path: "/ws" });
  wssBox.current = wss;
  attachConnectionHandler(wss, promptBroker);

  const scheduler = startSchedulerLoop({
    prisma,
    onDue: (job) =>
      runScheduledJob(job, prisma, providerConfigRepo, broadcast).catch((error: unknown) => {
        app.log.error(error, `scheduled job ${job.id} failed`);
      }),
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`received ${signal}, shutting down`);
    scheduler.stop();
    wss.close();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

try {
  await main();
} catch (error) {
  console.error("fatal startup error", error);
  process.exit(1);
}
