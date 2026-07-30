import type { PrismaClient, Suite } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb, seedAssistant } from "../../test/testDb.js";
import { NotFoundError, ValidationError } from "../../errors.js";
import { ProjectRepository } from "./projectRepository.js";
import { SuiteRepository } from "./suiteRepository.js";
import { ScheduledJobRepository } from "./scheduledJobRepository.js";

describe("ScheduledJobRepository", () => {
  let prisma: PrismaClient;
  let repo: ScheduledJobRepository;
  let suite: Suite;
  let assistantId: string;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new ScheduledJobRepository(prisma);
    const project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
    suite = await new SuiteRepository(prisma).create({ projectId: project.id, name: "Nightly" });
    assistantId = (await seedAssistant(prisma)).id;
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("creates an interval job with nextRunAt computed from now", async () => {
    const before = Date.now();
    const job = await repo.create({
      suiteId: suite.id,
      scheduleType: "interval",
      scheduleExpression: "60",
      assistantId,
      providerConfigId: "provider-1",
      model: "claude-sonnet",
    });
    expect(job.nextRunAt.getTime()).toBeGreaterThan(before);
    expect(job.mode).toBe("full_auto");
    expect(job.timezone).toBe("UTC");
  });

  it("creates a cron job with a computed next occurrence", async () => {
    const job = await repo.create({
      suiteId: suite.id,
      scheduleType: "cron",
      scheduleExpression: "0 9 * * *",
      assistantId,
      providerConfigId: "provider-1",
      model: "claude-sonnet",
    });
    expect(job.nextRunAt.getUTCHours()).toBe(9);
  });

  it("creates a one-time job at the given timestamp", async () => {
    const target = new Date(Date.now() + 3_600_000).toISOString();
    const job = await repo.create({
      suiteId: suite.id,
      scheduleType: "once",
      scheduleExpression: target,
      assistantId,
      providerConfigId: "provider-1",
      model: "claude-sonnet",
    });
    expect(job.nextRunAt.toISOString()).toBe(target);
  });

  it("rejects a job for a nonexistent suite", async () => {
    await expect(
      repo.create({
        suiteId: "does-not-exist",
        scheduleType: "interval",
        scheduleExpression: "60",
        assistantId,
        providerConfigId: "provider-1",
        model: "claude-sonnet",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects an invalid interval expression", async () => {
    await expect(
      repo.create({
        suiteId: suite.id,
        scheduleType: "interval",
        scheduleExpression: "not-a-number",
        assistantId,
        providerConfigId: "provider-1",
        model: "claude-sonnet",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("lists jobs by suite ordered by nextRunAt", async () => {
    await repo.create({
      suiteId: suite.id,
      scheduleType: "interval",
      scheduleExpression: "120",
      assistantId,
      providerConfigId: "provider-1",
      model: "claude-sonnet",
    });
    await repo.create({
      suiteId: suite.id,
      scheduleType: "interval",
      scheduleExpression: "10",
      assistantId,
      providerConfigId: "provider-1",
      model: "claude-sonnet",
    });
    const jobs = await repo.listBySuite(suite.id);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.nextRunAt.getTime()).toBeLessThan(jobs[1]?.nextRunAt.getTime() ?? Infinity);
  });

  it("toggles isActive via setActive", async () => {
    const job = await repo.create({
      suiteId: suite.id,
      scheduleType: "interval",
      scheduleExpression: "60",
      assistantId,
      providerConfigId: "provider-1",
      model: "claude-sonnet",
    });
    const disabled = await repo.setActive(job.id, false);
    expect(disabled.isActive).toBe(false);
  });

  it("deletes a job", async () => {
    const job = await repo.create({
      suiteId: suite.id,
      scheduleType: "interval",
      scheduleExpression: "60",
      assistantId,
      providerConfigId: "provider-1",
      model: "claude-sonnet",
    });
    await repo.delete(job.id);
    expect(await repo.listBySuite(suite.id)).toHaveLength(0);
  });

  it("throws NotFoundError deleting a job that doesn't exist", async () => {
    await expect(repo.delete("does-not-exist")).rejects.toThrow(NotFoundError);
  });
});
