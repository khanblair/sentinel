import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { ServerMessage } from "@sentinel/shared";
import { createPlaywrightPageFactory } from "../../automation/browserManager.js";
import type { ProviderConfigRepository } from "../../db/repositories/providerConfigRepository.js";
import { createInteractiveResolver, fullAutoResolver } from "../../executionLoop/confirmation.js";
import { createWsRunPauseResolver } from "../../metacognition/runPause.js";
import { runSuite } from "../../orchestrator/runSuite.js";
import { createProviderAdapter } from "../../providers/aiSdkProvider.js";
import type { WsPromptBroker } from "../../ws/promptBroker.js";
import { sendErrorResponse } from "./helpers.js";

const runSchema = z.object({
  assistantId: z.string().min(1),
  environmentId: z.string().nullable().optional(),
  mode: z.enum(["interactive", "full_auto"]),
  providerConfigId: z.string().min(1),
  model: z.string().min(1),
});

export interface RunRouteDeps {
  prisma: PrismaClient;
  providerConfigRepo: ProviderConfigRepository;
  promptBroker: WsPromptBroker;
  broadcast: (message: ServerMessage) => void;
}

/**
 * Triggers a Suite run asynchronously: responds as soon as the request validates,
 * then runs in the background broadcasting run:update/run:step over WebSocket. A
 * blocking HTTP response would hold the connection open for the run's entire
 * duration, which fights the live-ticker architecture (design §4.3) instead of
 * serving it.
 */
export function registerRunRoutes(app: FastifyInstance, deps: RunRouteDeps): void {
  app.post<{ Params: { id: string } }>("/api/suites/:id/run", async (request, reply) => {
    const parsed = runSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ status: "error", message: parsed.error.message });
    }

    try {
      const { apiKey, provider: providerName } = await deps.providerConfigRepo.getDecryptedApiKey(
        parsed.data.providerConfigId,
      );
      const provider = createProviderAdapter(providerName, apiKey, parsed.data.model);
      const runId = randomUUID();
      const isInteractive = parsed.data.mode === "interactive";
      const resolveConfirmation = isInteractive
        ? createInteractiveResolver(deps.promptBroker, runId)
        : fullAutoResolver;
      const resolveRunPause = isInteractive
        ? createWsRunPauseResolver(deps.promptBroker, runId)
        : undefined;

      void runSuite({
        prisma: deps.prisma,
        suiteId: request.params.id,
        assistantId: parsed.data.assistantId,
        environmentId: parsed.data.environmentId,
        mode: parsed.data.mode,
        provider,
        pageFactory: createPlaywrightPageFactory(),
        resolveConfirmation,
        resolveRunPause,
        broadcast: deps.broadcast,
        runId,
      }).catch((error: unknown) => {
        app.log.error(error, `run ${runId} failed`);
      });

      return reply.status(202).send({ runId, status: "accepted" });
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
