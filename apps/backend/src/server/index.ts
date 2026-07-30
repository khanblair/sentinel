import { WebSocketServer } from "ws";
import { createPrismaClient } from "../db/client.js";
import { loadOrCreateEncryptionKey } from "../security/encryption.js";
import { attachConnectionHandler } from "../ws/index.js";
import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? "127.0.0.1";

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const encryptionKey = loadOrCreateEncryptionKey();
  const app = buildApp({ prisma, encryptionKey });

  const address = await app.listen({ port: PORT, host: HOST });
  app.log.info(`Sentinel backend listening at ${address}`);

  const wss = new WebSocketServer({ server: app.server, path: "/ws" });
  attachConnectionHandler(wss);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`received ${signal}, shutting down`);
    wss.close();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("fatal startup error", error);
  process.exit(1);
});
