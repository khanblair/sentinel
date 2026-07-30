import type { PrismaClient } from "@prisma/client";
import type { ServerMessage } from "@sentinel/shared";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb, seedAssistant } from "../test/testDb.js";
import { NotFoundError } from "../errors.js";
import { FakePageFactory } from "../automation/fakePageFactory.js";
import { fullAutoResolver } from "../executionLoop/confirmation.js";
import { FakeProvider } from "../providers/fakeProvider.js";
import { ProjectRepository } from "../db/repositories/projectRepository.js";
import { SuiteRepository } from "../db/repositories/suiteRepository.js";
import { TestCaseRepository } from "../db/repositories/testCaseRepository.js";
import { runSuite } from "./runSuite.js";

async function seedSuiteWithOneCase(prisma: PrismaClient) {
  const project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
  const suite = await new SuiteRepository(prisma).create({ projectId: project.id, name: "Checkout" });
  const testCase = await new TestCaseRepository(prisma).create({
    suiteId: suite.id,
    module: "Checkout",
    title: "Apply discount code",
    priority: "P1",
    urlPath: "/cart",
    steps: "1. add item\n2. apply SAVE10",
    expectedResult: "total reduced by 10%",
  });
  return { project, suite, testCase };
}

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

describe("runSuite", () => {
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

  it("persists a passing Run and broadcasts run:update/run:step in order", async () => {
    const { suite } = await seedSuiteWithOneCase(prisma);
    const assistant = await seedAssistant(prisma);
    const provider = new FakeProvider().queueObject({
      object: { steps: ["assert the total is reduced by 10%"] },
      usage: { promptTokens: 5, completionTokens: 5 },
    });
    assertPassStep(provider, "the total line item read the discounted amount");

    const pageFactory = new FakePageFactory();
    const messages: ServerMessage[] = [];

    const run = await runSuite({
      prisma,
      suiteId: suite.id,
      assistantId: assistant.id,
      mode: "interactive",
      provider,
      pageFactory,
      resolveConfirmation: fullAutoResolver,
      broadcast: (message) => messages.push(message),
    });

    expect(run.status).toBe("passed");
    expect(run.finishedAt).not.toBeNull();

    const stepLogs = await prisma.stepLog.findMany({ where: { runId: run.id } });
    expect(stepLogs).toHaveLength(1);
    expect(stepLogs[0]?.verdict).toBe("pass");

    expect(messages.map((message) => message.type)).toEqual(["run:update", "run:step", "run:update"]);
    const finalUpdate = messages[2];
    expect(finalUpdate?.type === "run:update" && finalUpdate.run.status).toBe("passed");

    expect(pageFactory.closed).toBe(true);
    expect(pageFactory.requestedUrls).toEqual(["/cart"]);
  });

  it("stops a test case at its first non-pass step (short-circuit)", async () => {
    const { suite } = await seedSuiteWithOneCase(prisma);
    const assistant = await seedAssistant(prisma);
    const provider = new FakeProvider().queueObject({
      object: { steps: ["step one", "step two — never reached"] },
      usage: { promptTokens: 5, completionTokens: 5 },
    });
    assertFailStep(provider, "step one failed outright");
    // Deliberately no second scripted response — if the loop tried a second step,
    // FakeProvider would throw "no scripted object response queued" and this test
    // would fail with an error instead of a clean assertion.

    const run = await runSuite({
      prisma,
      suiteId: suite.id,
      assistantId: assistant.id,
      mode: "interactive",
      provider,
      pageFactory: new FakePageFactory(),
      resolveConfirmation: fullAutoResolver,
      broadcast: () => {},
    });

    expect(run.status).toBe("failed");
    const stepLogs = await prisma.stepLog.findMany({ where: { runId: run.id } });
    expect(stepLogs).toHaveLength(1);
  });

  it("overall Run status is the worst verdict across all test cases", async () => {
    const { project, suite, testCase: firstCase } = await seedSuiteWithOneCase(prisma);
    const assistant = await seedAssistant(prisma);
    void firstCase;
    const testCases = new TestCaseRepository(prisma);
    await testCases.create({
      suiteId: suite.id,
      module: "Checkout",
      title: "Second case",
      priority: "P2",
      urlPath: "/receipt",
      steps: "1. view receipt",
      expectedResult: "receipt shown",
    });
    void project;

    const provider = new FakeProvider();
    provider.queueObject({ object: { steps: ["check discount"] }, usage: { promptTokens: 5, completionTokens: 5 } });
    assertPassStep(provider, "discount applied correctly");
    provider.queueObject({ object: { steps: ["check receipt"] }, usage: { promptTokens: 5, completionTokens: 5 } });
    assertFailStep(provider, "receipt was blank");

    const run = await runSuite({
      prisma,
      suiteId: suite.id,
      assistantId: assistant.id,
      mode: "interactive",
      provider,
      pageFactory: new FakePageFactory(),
      resolveConfirmation: fullAutoResolver,
      broadcast: () => {},
    });

    expect(run.status).toBe("failed");
    const stepLogs = await prisma.stepLog.findMany({ where: { runId: run.id }, orderBy: { stepIndex: "asc" } });
    expect(stepLogs).toHaveLength(2);
    expect(stepLogs[0]?.verdict).toBe("pass");
    expect(stepLogs[1]?.verdict).toBe("fail");
  });

  it("throws NotFoundError for a suite that doesn't exist, without creating a Run", async () => {
    await expect(
      runSuite({
        prisma,
        suiteId: "does-not-exist",
        assistantId: "assistant-1",
        mode: "interactive",
        provider: new FakeProvider(),
        pageFactory: new FakePageFactory(),
        resolveConfirmation: fullAutoResolver,
        broadcast: () => {},
      }),
    ).rejects.toThrow(NotFoundError);

    expect(await prisma.run.count()).toBe(0);
  });

  it("persists ProviderUsage rows for checklist generation and each step, attributed to the provider/model", async () => {
    const { suite } = await seedSuiteWithOneCase(prisma);
    const assistant = await seedAssistant(prisma);
    const provider = new FakeProvider().queueObject({
      object: { steps: ["assert the total is reduced by 10%"] },
      usage: { promptTokens: 11, completionTokens: 7 },
    });
    assertPassStep(provider, "the total line item read the discounted amount");

    const run = await runSuite({
      prisma,
      suiteId: suite.id,
      assistantId: assistant.id,
      mode: "interactive",
      provider,
      pageFactory: new FakePageFactory(),
      resolveConfirmation: fullAutoResolver,
      broadcast: () => {},
    });

    const usageRows = await prisma.providerUsage.findMany({ where: { runId: run.id } });
    expect(usageRows).toHaveLength(2); // one for checklist generation, one for the step
    expect(usageRows.every((row) => row.provider === "claude" && row.model === "fake-model")).toBe(true);
    const totalPromptTokens = usageRows.reduce((sum, row) => sum + row.promptTokens, 0);
    expect(totalPromptTokens).toBe(16); // 11 (checklist) + 5 (step, from assertPassStep's fixed usage)
    // No maintained rate for "fake-model" — cost must stay null, not a guessed number.
    expect(usageRows.every((row) => row.estimatedCostUsd === null)).toBe(true);
  });

  it("populates Run.insights with a summary after finishing", async () => {
    const { suite } = await seedSuiteWithOneCase(prisma);
    const assistant = await seedAssistant(prisma);
    const provider = new FakeProvider().queueObject({
      object: { steps: ["assert the total is reduced by 10%"] },
      usage: { promptTokens: 5, completionTokens: 5 },
    });
    assertPassStep(provider, "the total line item read the discounted amount");

    const run = await runSuite({
      prisma,
      suiteId: suite.id,
      assistantId: assistant.id,
      mode: "interactive",
      provider,
      pageFactory: new FakePageFactory(),
      resolveConfirmation: fullAutoResolver,
      broadcast: () => {},
    });

    const finished = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.insights).toBe("1 passed, 0 failed, 0 blocked.");
  });

  it("Interactive mode: pauses the run when the tester declines to continue past a systemic-looking failure", async () => {
    const project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
    const suite = await new SuiteRepository(prisma).create({ projectId: project.id, name: "Checkout" });
    const assistant = await seedAssistant(prisma);
    const testCases = new TestCaseRepository(prisma);
    for (let i = 0; i < 4; i += 1) {
      await testCases.create({
        suiteId: suite.id,
        module: "Checkout",
        title: `Case ${i}`,
        priority: "P2",
        urlPath: `/case-${i}`,
        steps: "1. do thing",
        expectedResult: "thing happens",
      });
    }

    const provider = new FakeProvider();
    for (let i = 0; i < 3; i += 1) {
      provider.queueObject({ object: { steps: ["check thing"] }, usage: { promptTokens: 5, completionTokens: 5 } });
      assertFailStep(provider, `case ${i} failed`);
    }
    // No 4th checklist/step scripted — if runSuite tried the 4th case despite the
    // tester declining to continue, FakeProvider would throw and this test would
    // fail with an error instead of a clean assertion on the run's final status.

    const run = await runSuite({
      prisma,
      suiteId: suite.id,
      assistantId: assistant.id,
      mode: "interactive",
      provider,
      pageFactory: new FakePageFactory(),
      resolveConfirmation: fullAutoResolver,
      resolveRunPause: async () => false,
      broadcast: () => {},
    });

    expect(run.status).toBe("blocked");
    const stepLogs = await prisma.stepLog.findMany({ where: { runId: run.id } });
    expect(stepLogs).toHaveLength(3);
    const finished = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.insights).toContain("stopped early by the tester");
  });

  it("Full-Auto mode never calls resolveRunPause, even with the same early-failure pattern", async () => {
    const project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
    const suite = await new SuiteRepository(prisma).create({ projectId: project.id, name: "Checkout" });
    const assistant = await seedAssistant(prisma);
    const testCases = new TestCaseRepository(prisma);
    for (let i = 0; i < 3; i += 1) {
      await testCases.create({
        suiteId: suite.id,
        module: "Checkout",
        title: `Case ${i}`,
        priority: "P2",
        urlPath: `/case-${i}`,
        steps: "1. do thing",
        expectedResult: "thing happens",
      });
    }

    const provider = new FakeProvider();
    for (let i = 0; i < 3; i += 1) {
      provider.queueObject({ object: { steps: ["check thing"] }, usage: { promptTokens: 5, completionTokens: 5 } });
      assertFailStep(provider, `case ${i} failed`);
    }

    let resolveRunPauseCalls = 0;
    const run = await runSuite({
      prisma,
      suiteId: suite.id,
      assistantId: assistant.id,
      mode: "full_auto",
      provider,
      pageFactory: new FakePageFactory(),
      resolveConfirmation: fullAutoResolver,
      resolveRunPause: async () => {
        resolveRunPauseCalls += 1;
        return false;
      },
      broadcast: () => {},
    });

    expect(resolveRunPauseCalls).toBe(0);
    expect(run.status).toBe("failed");
    const stepLogs = await prisma.stepLog.findMany({ where: { runId: run.id } });
    expect(stepLogs).toHaveLength(3);
  });

  it("marks the Run failed and still closes the page factory when checklist generation throws", async () => {
    const { suite } = await seedSuiteWithOneCase(prisma);
    const assistant = await seedAssistant(prisma);
    const provider = new FakeProvider(); // no scripted response queued -> generateObject throws
    const pageFactory = new FakePageFactory();
    const messages: ServerMessage[] = [];

    await expect(
      runSuite({
        prisma,
        suiteId: suite.id,
        assistantId: assistant.id,
        mode: "interactive",
        provider,
        pageFactory,
        resolveConfirmation: fullAutoResolver,
        broadcast: (message) => messages.push(message),
      }),
    ).rejects.toThrow();

    expect(pageFactory.closed).toBe(true);
    const run = await prisma.run.findFirstOrThrow({ where: { suiteId: suite.id } });
    expect(run.status).toBe("failed");
    expect(run.finishedAt).not.toBeNull();
  });
});
