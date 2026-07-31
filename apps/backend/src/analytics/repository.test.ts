import type { PrismaClient, Suite, TestCase } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb, seedAssistant } from "../test/testDb.js";
import { ProjectRepository } from "../db/repositories/projectRepository.js";
import { SuiteRepository } from "../db/repositories/suiteRepository.js";
import { AnalyticsRepository } from "./repository.js";

describe("AnalyticsRepository", () => {
  let prisma: PrismaClient;
  let repo: AnalyticsRepository;
  let suite: Suite;
  let projectId: string;
  let testCase: TestCase;
  let assistantId: string;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new AnalyticsRepository(prisma);
    const project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
    projectId = project.id;
    suite = await new SuiteRepository(prisma).create({ projectId, name: "Checkout" });
    testCase = await prisma.testCase.create({
      data: {
        suiteId: suite.id,
        module: "Checkout",
        subModule: "Payment",
        title: "Apply discount",
        priority: "P1",
        urlPath: "/cart",
        steps: "1. x",
        expectedResult: "y",
      },
    });
    assistantId = (await seedAssistant(prisma)).id;
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  async function createRun(status: string, verdict: "pass" | "fail" | "blocked", startedAt: Date): Promise<string> {
    const run = await prisma.run.create({
      data: { suiteId: suite.id, assistantId, status, startedAt, finishedAt: startedAt },
    });
    await prisma.stepLog.create({
      data: {
        runId: run.id,
        testCaseId: testCase.id,
        stepIndex: 0,
        toolCall: "{}",
        observation: "x",
        verdict,
        confidence: 0.9,
        confidenceReason: "x",
      },
    });
    return run.id;
  }

  it("passFailTrend returns runs ordered oldest to newest", async () => {
    await createRun("passed", "pass", new Date("2026-01-02T00:00:00Z"));
    await createRun("failed", "fail", new Date("2026-01-01T00:00:00Z"));

    const trend = await repo.passFailTrend(suite.id);
    expect(trend).toHaveLength(2);
    expect(trend[0]?.status).toBe("failed");
    expect(trend[1]?.status).toBe("passed");
  });

  it("flakyCases detects a case that flips between pass and fail across runs", async () => {
    await createRun("passed", "pass", new Date("2026-01-01T00:00:00Z"));
    await createRun("failed", "fail", new Date("2026-01-02T00:00:00Z"));
    await createRun("passed", "pass", new Date("2026-01-03T00:00:00Z"));

    const flaky = await repo.flakyCases(suite.id);
    expect(flaky).toHaveLength(1);
    expect(flaky[0]?.testCaseId).toBe(testCase.id);
    expect(flaky[0]?.flipCount).toBe(2);
  });

  it("moduleRiskHeatmap aggregates by module/subModule across the project's suites", async () => {
    await createRun("failed", "fail", new Date("2026-01-01T00:00:00Z"));
    await createRun("passed", "pass", new Date("2026-01-02T00:00:00Z"));

    const heatmap = await repo.moduleRiskHeatmap(projectId);
    expect(heatmap).toHaveLength(1);
    expect(heatmap[0]?.module).toBe("Checkout");
    expect(heatmap[0]?.subModule).toBe("Payment");
    expect(heatmap[0]?.total).toBe(2);
    expect(heatmap[0]?.failCount).toBe(1);
  });

  it("recentRuns returns runs newest-first with suite/project names attached", async () => {
    await createRun("passed", "pass", new Date("2026-01-01T00:00:00Z"));
    await createRun("failed", "fail", new Date("2026-01-02T00:00:00Z"));

    const recent = await repo.recentRuns(10);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.status).toBe("failed");
    expect(recent[0]?.suiteName).toBe("Checkout");
    expect(recent[0]?.projectName).toBe("SoundWave");
  });

  it("recentRuns respects the limit across many runs", async () => {
    for (let i = 0; i < 5; i += 1) {
      await createRun("passed", "pass", new Date(2026, 0, i + 1));
    }
    const recent = await repo.recentRuns(3);
    expect(recent).toHaveLength(3);
  });

  it("usageBySuite sums tokens per provider/model and leaves cost null with no rate", async () => {
    const runId = await createRun("passed", "pass", new Date("2026-01-01T00:00:00Z"));
    await prisma.providerUsage.create({
      data: { runId, provider: "claude", model: "claude-sonnet", promptTokens: 100, completionTokens: 50 },
    });
    await prisma.providerUsage.create({
      data: { runId, provider: "claude", model: "claude-sonnet", promptTokens: 20, completionTokens: 10 },
    });

    const usage = await repo.usageBySuite(suite.id);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.promptTokens).toBe(120);
    expect(usage[0]?.completionTokens).toBe(60);
    expect(usage[0]?.runCount).toBe(2);
    expect(usage[0]?.estimatedCostUsd).toBeNull();
  });
});
