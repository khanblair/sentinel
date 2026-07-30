import { WebSocketServer } from "ws";
import type { ServerMessage } from "@sentinel/shared";
import { createPrismaClient } from "../db/client.js";
import { seedBuiltInAssistants } from "../db/seedAssistants.js";
import { loadOrCreateEncryptionKey } from "../security/encryption.js";
import { attachConnectionHandler, broadcast as broadcastToClients } from "../ws/index.js";
import { WsPromptBroker } from "../ws/promptBroker.js";
import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? "127.0.0.1";

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const encryptionKey = loadOrCreateEncryptionKey();
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

  const app = buildApp({ prisma, encryptionKey, broadcast, promptBroker });

  const address = await app.listen({ port: PORT, host: HOST });
  app.log.info(`Sentinel backend listening at ${address}`);

  const wss = new WebSocketServer({ server: app.server, path: "/ws" });
  wssBox.current = wss;
  attachConnectionHandler(wss, promptBroker);

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

try {
  await main();
} catch (error) {
  console.error("fatal startup error", error);
  process.exit(1);
}
