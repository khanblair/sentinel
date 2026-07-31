import type { PrismaClient, Project } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../test/testDb.js";
import { ProjectRepository } from "../db/repositories/projectRepository.js";
import { SuiteRepository } from "../db/repositories/suiteRepository.js";
import { TestCaseRepository } from "../db/repositories/testCaseRepository.js";
import { EnvironmentRepository } from "../db/repositories/environmentRepository.js";
import { RuleRepository } from "../db/repositories/ruleRepository.js";
import { AssistantRepository } from "../db/repositories/assistantRepository.js";
import { ValidationError } from "../errors.js";
import { BUNDLE_VERSION, exportProjectBundle, importProjectBundle } from "./projectBundle.js";

async function seedFullProject(prisma: PrismaClient): Promise<Project> {
  const project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
  await new EnvironmentRepository(prisma).create({
    projectId: project.id,
    name: "Staging",
    baseUrl: "https://staging.example.com",
  });
  await new RuleRepository(prisma).create({
    scope: "project",
    projectId: project.id,
    text: "Never submit the real payment form.",
  });
  await new AssistantRepository(prisma).create({
    projectId: project.id,
    name: "SoundWave QA",
    systemPrompt: "You test SoundWave's checkout flow.",
    defaultSkills: ["network-assertion"],
  });
  const suite = await new SuiteRepository(prisma).create({ projectId: project.id, name: "Checkout" });
  await new TestCaseRepository(prisma).create({
    suiteId: suite.id,
    module: "Checkout",
    title: "Apply discount",
    priority: "P1",
    urlPath: "/cart",
    steps: "1. add item\n2. apply code",
    expectedResult: "total reduced by 10%",
    tags: ["smoke"],
  });
  return project;
}

describe("projectBundle", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  it("exports every project-scoped entity but no Runs/StepLogs/ScheduledJobs", async () => {
    const project = await seedFullProject(prisma);
    const bundle = await exportProjectBundle(prisma, project.id);

    expect(bundle.version).toBe(BUNDLE_VERSION);
    expect(bundle.project.name).toBe("SoundWave");
    expect(bundle.environments).toHaveLength(1);
    expect(bundle.rules).toHaveLength(1);
    expect(bundle.assistants).toHaveLength(1);
    expect(bundle.suites).toHaveLength(1);
    expect(bundle.suites[0]?.testCases).toHaveLength(1);
    expect(bundle.suites[0]?.testCases[0]?.tags).toEqual(["smoke"]);
    expect(bundle).not.toHaveProperty("runs");
  });

  it("excludes built-in assistants and global rules from the export", async () => {
    const project = await seedFullProject(prisma);
    await new RuleRepository(prisma).create({ scope: "global", text: "Always screenshot on failure." });

    const bundle = await exportProjectBundle(prisma, project.id);
    expect(bundle.rules).toHaveLength(1);
    expect(bundle.rules[0]?.text).toBe("Never submit the real payment form.");
    expect(bundle.assistants.every((a) => a.name !== "API/Network Watcher")).toBe(true);
  });

  it("round-trips export -> import into a brand-new project with fresh IDs", async () => {
    const project = await seedFullProject(prisma);
    const bundle = await exportProjectBundle(prisma, project.id);

    const summary = await importProjectBundle(prisma, bundle);

    expect(summary.projectId).not.toBe(project.id);
    expect(summary.projectName).toBe("SoundWave");
    expect(summary.suiteCount).toBe(1);
    expect(summary.testCaseCount).toBe(1);
    expect(summary.environmentCount).toBe(1);
    expect(summary.ruleCount).toBe(1);
    expect(summary.assistantCount).toBe(1);

    const reimported = await exportProjectBundle(prisma, summary.projectId);
    expect(reimported.suites[0]?.testCases[0]?.title).toBe("Apply discount");
  });

  it("re-importing the same bundle twice creates two independent projects", async () => {
    const project = await seedFullProject(prisma);
    const bundle = await exportProjectBundle(prisma, project.id);

    const first = await importProjectBundle(prisma, bundle);
    const second = await importProjectBundle(prisma, bundle);

    expect(first.projectId).not.toBe(second.projectId);
  });

  it("preserves archived state through export and import", async () => {
    const project = await seedFullProject(prisma);
    const suite = (await new SuiteRepository(prisma).listByProject(project.id))[0]!;
    await new SuiteRepository(prisma).archive(suite.id);

    const bundle = await exportProjectBundle(prisma, project.id);
    expect(bundle.suites[0]?.archived).toBe(true);

    const summary = await importProjectBundle(prisma, bundle);
    const reimported = await exportProjectBundle(prisma, summary.projectId);
    expect(reimported.suites[0]?.archived).toBe(true);
  });

  it("rejects a malformed bundle", async () => {
    await expect(importProjectBundle(prisma, { version: 1 })).rejects.toThrow(ValidationError);
  });

  it("rejects a bundle with an unsupported version", async () => {
    const project = await seedFullProject(prisma);
    const bundle = await exportProjectBundle(prisma, project.id);
    await expect(importProjectBundle(prisma, { ...bundle, version: 999 })).rejects.toThrow(ValidationError);
  });
});
