import type { PrismaClient } from "@prisma/client";
import type { ServerMessage } from "@sentinel/shared";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb, seedAssistant } from "../test/testDb.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { FakePageFactory } from "../automation/fakePageFactory.js";
import { fullAutoResolver } from "../executionLoop/confirmation.js";
import { FakeProvider } from "../providers/fakeProvider.js";
import { RuleRepository } from "../db/repositories/ruleRepository.js";
import { PreviewController } from "../ws/previewController.js";
import { runAdHoc } from "./runAdHoc.js";

function assertPassStep(provider: FakeProvider, reason: string): void {
  provider.queueObject({
    object: { toolCall: { tool: "assert_condition", verdict: "pass", confidence: 0.9, reason } },
    usage: { promptTokens: 5, completionTokens: 5 },
  });
}

function assertFailStep(provider: FakeProvider, reason: string): void {
  provider.queueObject({
    object: { toolCall: { tool: "assert_condition", verdict: "fail", confidence: 0.9, reason } },
    usage: { promptTokens: 5, completionTokens: 5 },
  });
}

describe("runAdHoc", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("persists a Run with suiteId null and a StepLog with testCaseId null", async () => {
    const assistant = await seedAssistant(prisma);
    const provider = new FakeProvider();
    assertPassStep(provider, "the page loaded and showed the expected heading");

    const pageFactory = new FakePageFactory();
    const messages: ServerMessage[] = [];

    const run = await runAdHoc({
      prisma,
      url: "https://example.com/checkout",
      checklist: ["assert the checkout page loads"],
      assistantId: assistant.id,
      mode: "interactive",
      provider,
      pageFactory,
      previewController: new PreviewController(() => {}),
      resolveConfirmation: fullAutoResolver,
      broadcast: (message) => messages.push(message),
    });

    expect(run.suiteId).toBeNull();
    expect(run.status).toBe("passed");

    const stepLogs = await prisma.stepLog.findMany({ where: { runId: run.id } });
    expect(stepLogs).toHaveLength(1);
    expect(stepLogs[0]?.testCaseId).toBeNull();

    expect(pageFactory.requestedUrls).toEqual(["https://example.com/checkout"]);
    expect(pageFactory.closed).toBe(true);
    expect(messages.map((m) => m.type)).toEqual(["run:update", "run:step", "run:update"]);
  });

  it("stops at the first non-pass step, matching runSuite's per-checklist short-circuit", async () => {
    const assistant = await seedAssistant(prisma);
    const provider = new FakeProvider();
    assertFailStep(provider, "checkout button missing");
    // No second scripted response — if runAdHoc kept going after a fail, FakeProvider
    // would throw and this test would fail with an error instead of a clean assertion.

    const run = await runAdHoc({
      prisma,
      url: "https://example.com/checkout",
      checklist: ["assert checkout works", "assert receipt shows — never reached"],
      assistantId: assistant.id,
      mode: "interactive",
      provider,
      pageFactory: new FakePageFactory(),
      previewController: new PreviewController(() => {}),
      resolveConfirmation: fullAutoResolver,
      broadcast: () => {},
    });

    expect(run.status).toBe("failed");
    const stepLogs = await prisma.stepLog.findMany({ where: { runId: run.id } });
    expect(stepLogs).toHaveLength(1);
  });

  it("composes the Assistant's persona and Global Rules (not Project Rules — there is no project)", async () => {
    const assistant = await prisma.assistant.create({
      data: { name: "Explorer", systemPrompt: "You explore pages ad-hoc.", isBuiltIn: false },
    });
    await new RuleRepository(prisma).create({ scope: "global", text: "Never submit real payment forms" });

    const provider = new FakeProvider();
    assertPassStep(provider, "looks fine");

    await runAdHoc({
      prisma,
      url: "https://example.com",
      checklist: ["assert something"],
      assistantId: assistant.id,
      mode: "interactive",
      provider,
      pageFactory: new FakePageFactory(),
      previewController: new PreviewController(() => {}),
      resolveConfirmation: fullAutoResolver,
      broadcast: () => {},
    });

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.systemPrompt).toContain("You explore pages ad-hoc.");
    expect(provider.calls[0]?.systemPrompt).toContain("Never submit real payment forms");
  });

  it("rejects an empty checklist without creating a Run", async () => {
    const assistant = await seedAssistant(prisma);
    await expect(
      runAdHoc({
        prisma,
        url: "https://example.com",
        checklist: [],
        assistantId: assistant.id,
        mode: "interactive",
        provider: new FakeProvider(),
        pageFactory: new FakePageFactory(),
        previewController: new PreviewController(() => {}),
        resolveConfirmation: fullAutoResolver,
        broadcast: () => {},
      }),
    ).rejects.toThrow(ValidationError);
    expect(await prisma.run.count()).toBe(0);
  });

  it("throws NotFoundError for an assistant that doesn't exist, without creating a Run", async () => {
    await expect(
      runAdHoc({
        prisma,
        url: "https://example.com",
        checklist: ["assert something"],
        assistantId: "does-not-exist",
        mode: "interactive",
        provider: new FakeProvider(),
        pageFactory: new FakePageFactory(),
        previewController: new PreviewController(() => {}),
        resolveConfirmation: fullAutoResolver,
        broadcast: () => {},
      }),
    ).rejects.toThrow(NotFoundError);
    expect(await prisma.run.count()).toBe(0);
  });
});
