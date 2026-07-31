import type { PrismaClient } from "@prisma/client";
import type { Run, RunMode, ServerMessage, StepVerdict } from "@sentinel/shared";
import { RuleRepository } from "../db/repositories/ruleRepository.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { ConfirmationResolver } from "../executionLoop/confirmation.js";
import { generateRunInsights } from "../metacognition/insights.js";
import type { ProviderAdapter } from "../providers/types.js";
import type { PageFactory } from "../automation/page.js";
import type { PreviewController } from "../ws/previewController.js";
import { runChecklistSteps } from "./runChecklistSteps.js";
import { serializeRun, verdictToRunStatus } from "./shared.js";
import { composePersonaAndRules } from "./systemPrompt.js";

/** Assistant persona + Global Rules for a URL that has no Suite/Project to scope
 * Project Rules to. Shared by the checklist-preview route (which needs the prefix
 * before a Run exists) and runAdHoc itself. */
export async function buildAdHocPersonaPrefix(prisma: PrismaClient, assistantId: string): Promise<string> {
  const assistant = await prisma.assistant.findUnique({ where: { id: assistantId } });
  if (!assistant) {
    throw new NotFoundError(`Assistant ${assistantId} not found`);
  }
  const globalRules = await new RuleRepository(prisma).listGlobal();
  return composePersonaAndRules(assistant.systemPrompt, globalRules.map((rule) => rule.text));
}

export interface RunAdHocOptions {
  prisma: PrismaClient;
  url: string;
  /** Already generated (via generateChecklistFromInstruction) and approved/edited
   * by the tester — design §4.4's "shown for approval/edits first, plan-mode
   * style" happens as a separate step before this is ever called. */
  checklist: readonly string[];
  assistantId: string;
  mode: RunMode;
  provider: ProviderAdapter;
  pageFactory: PageFactory;
  resolveConfirmation: ConfirmationResolver;
  broadcast: (message: ServerMessage) => void;
  runId?: string;
  trigger?: Run["trigger"];
  previewController: PreviewController;
}

/**
 * Ad-hoc counterpart to runSuite: one pre-approved checklist against a raw URL,
 * no Suite/Test Case/Project involved (Run.suiteId stays null; every StepLog's
 * testCaseId stays null). Only Global Rules apply — there's no project to scope
 * Project Rules to. Deliberately has no run-level pause-and-continue prompt
 * (design §6.4): that logic compares verdicts *across several test cases*, and an
 * ad-hoc run is only ever one checklist. "Save this as a Suite?" (design §4.4) is
 * deferred — this only runs the checklist and records the result.
 */
export async function runAdHoc(options: RunAdHocOptions): Promise<Run> {
  const {
    prisma,
    url,
    checklist,
    assistantId,
    mode,
    provider,
    pageFactory,
    resolveConfirmation,
    broadcast,
    runId,
    trigger = "manual",
    previewController,
  } = options;

  if (checklist.length === 0) {
    throw new ValidationError("An ad-hoc run needs at least one checklist step");
  }

  const personaPrefix = await buildAdHocPersonaPrefix(prisma, assistantId);

  const run = await prisma.run.create({
    data: {
      ...(runId ? { id: runId } : {}),
      suiteId: null,
      assistantId,
      environmentId: null,
      mode,
      trigger,
      status: "running",
    },
  });
  broadcast({ type: "run:update", run: serializeRun(run) });

  try {
    const page = await pageFactory.getPage(url);
    await previewController.attachPage(run.id, page);
    const stepIndexCounter = { value: 0 };
    const verdict: StepVerdict = await runChecklistSteps({
      prisma,
      runId: run.id,
      provider,
      page,
      resolveConfirmation,
      broadcast,
      steps: checklist,
      testCaseId: null,
      stepIndexCounter,
      personaPrefix,
      previewController,
    });

    const allStepLogs = await prisma.stepLog.findMany({ where: { runId: run.id } });
    const insights = generateRunInsights(
      allStepLogs.map((s) => ({ verdict: s.verdict as StepVerdict, confidenceReason: s.confidenceReason })),
    );

    const finished = await prisma.run.update({
      where: { id: run.id },
      data: { status: verdictToRunStatus(verdict), finishedAt: new Date(), insights },
    });
    broadcast({ type: "run:update", run: serializeRun(finished) });
    return serializeRun(finished);
  } catch (error) {
    const failed = await prisma.run.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date() },
    });
    broadcast({ type: "run:update", run: serializeRun(failed) });
    throw error;
  } finally {
    await previewController.detachPage(run.id);
    previewController.cleanup(run.id);
    await pageFactory.close();
  }
}
