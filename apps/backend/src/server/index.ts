import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { checkDatabaseConnection, prisma } from "../db/client.js";
import { attachConnectionHandler } from "../ws/index.js";

const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? "127.0.0.1";

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  app.get("/health", async (_request, reply) => {
    const dbOk = await checkDatabaseConnection();
    if (!dbOk) {
      return reply.status(503).send({ status: "error", db: "unreachable" });
    }
    return reply.send({ status: "ok", db: "connected" });
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({ status: "error", message: "internal server error" });
  });

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
