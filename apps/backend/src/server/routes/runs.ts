import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { ServerMessage } from "@sentinel/shared";
import { createPlaywrightPageFactory } from "../../automation/browserManager.js";
import { generateChecklistFromInstruction } from "../../checklistGenerator/index.js";
import type { ProviderConfigRepository } from "../../db/repositories/providerConfigRepository.js";
import { createInteractiveResolver, fullAutoResolver } from "../../executionLoop/confirmation.js";
import { createWsRunPauseResolver } from "../../metacognition/runPause.js";
import { buildAdHocPersonaPrefix, runAdHoc } from "../../orchestrator/runAdHoc.js";
import { runSuite } from "../../orchestrator/runSuite.js";
import { createProviderAdapter } from "../../providers/aiSdkProvider.js";
import type { WsPromptBroker } from "../../ws/promptBroker.js";
import type { PreviewController } from "../../ws/previewController.js";
import { sendErrorResponse } from "./helpers.js";

const runSchema = z.object({
  assistantId: z.string().min(1),
  environmentId: z.string().nullable().optional(),
  mode: z.enum(["interactive", "full_auto"]),
  providerConfigId: z.string().min(1),
  model: z.string().min(1),
});

const adHocChecklistSchema = z.object({
  url: z.string().min(1),
  instruction: z.string().min(1),
  assistantId: z.string().min(1),
  providerConfigId: z.string().min(1),
  model: z.string().min(1),
});

const adHocRunSchema = z.object({
  url: z.string().min(1),
  checklist: z.array(z.string().min(1)).min(1),
  assistantId: z.string().min(1),
  mode: z.enum(["interactive", "full_auto"]),
  providerConfigId: z.string().min(1),
  model: z.string().min(1),
});

export interface RunRouteDeps {
  prisma: PrismaClient;
  providerConfigRepo: ProviderConfigRepository;
  promptBroker: WsPromptBroker;
  broadcast: (message: ServerMessage) => void;
  previewController: PreviewController;
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
        previewController: deps.previewController,
      }).catch((error: unknown) => {
        app.log.error(error, `run ${runId} failed`);
      });

      return reply.status(202).send({ runId, status: "accepted" });
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  /** Preview step (design §4.4): generates a checklist for a tester to review/edit
   * before anything runs. A synchronous request/response, unlike the fire-and-forget
   * run endpoints below — there's no Run yet, just an LLM call worth waiting for. */
  app.post("/api/adhoc/checklist", async (request, reply) => {
    const parsed = adHocChecklistSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ status: "error", message: parsed.error.message });
    }
    try {
      const { apiKey, provider: providerName } = await deps.providerConfigRepo.getDecryptedApiKey(
        parsed.data.providerConfigId,
      );
      const provider = createProviderAdapter(providerName, apiKey, parsed.data.model);
      const personaPrefix = await buildAdHocPersonaPrefix(deps.prisma, parsed.data.assistantId);
      const checklist = await generateChecklistFromInstruction({
        provider,
        url: parsed.data.url,
        instruction: parsed.data.instruction,
        personaPrefix,
      });
      return reply.send({ steps: checklist.steps });
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  /** Runs a tester-approved (and possibly edited) checklist against a raw URL —
   * no Suite involved. Same fire-and-forget shape as /api/suites/:id/run. */
  app.post("/api/adhoc/run", async (request, reply) => {
    const parsed = adHocRunSchema.safeParse(request.body);
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

      void runAdHoc({
        prisma: deps.prisma,
        url: parsed.data.url,
        checklist: parsed.data.checklist,
        assistantId: parsed.data.assistantId,
        mode: parsed.data.mode,
        provider,
        pageFactory: createPlaywrightPageFactory(),
        resolveConfirmation,
        broadcast: deps.broadcast,
        runId,
        previewController: deps.previewController,
      }).catch((error: unknown) => {
        app.log.error(error, `ad-hoc run ${runId} failed`);
      });

      return reply.status(202).send({ runId, status: "accepted" });
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
