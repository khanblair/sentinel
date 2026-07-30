import type { PrismaClient, Project } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../../test/testDb.js";
import { NotFoundError, ValidationError } from "../../errors.js";
import { ProjectRepository } from "./projectRepository.js";
import { SuiteRepository } from "./suiteRepository.js";
import { TestCaseRepository } from "./testCaseRepository.js";

describe("SuiteRepository", () => {
  let prisma: PrismaClient;
  let repo: SuiteRepository;
  let project: Project;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new SuiteRepository(prisma);
    project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("creates a suite under an existing project", async () => {
    const suite = await repo.create({ projectId: project.id, name: "Checkout flow" });
    expect(suite.projectId).toBe(project.id);
  });

  it("rejects a suite for a nonexistent project", async () => {
    await expect(repo.create({ projectId: "missing", name: "X" })).rejects.toThrow(NotFoundError);
  });

  it("rejects an empty suite name", async () => {
    await expect(repo.create({ projectId: project.id, name: "  " })).rejects.toThrow(ValidationError);
  });

  it("excludes archived suites from listByProject by default", async () => {
    const suite = await repo.create({ projectId: project.id, name: "Regression" });
    await repo.archive(suite.id);
    expect(await repo.listByProject(project.id)).toHaveLength(0);
    expect(await repo.listByProject(project.id, { includeArchived: true })).toHaveLength(1);
  });

  it("clone copies the suite's test cases into a new suite", async () => {
    const suite = await repo.create({ projectId: project.id, name: "Original" });
    const testCases = new TestCaseRepository(prisma);
    await testCases.create({
      suiteId: suite.id,
      module: "Auth",
      title: "Login works",
      priority: "P1",
      urlPath: "/login",
      steps: "1. go to /login\n2. submit",
      expectedResult: "redirects to dashboard",
      tags: ["smoke"],
    });

    const cloned = await repo.clone(suite.id);
    expect(cloned.name).toBe("Original (copy)");

    const clonedCases = await testCases.listBySuite(cloned.id);
    expect(clonedCases).toHaveLength(1);
    expect(clonedCases[0]?.title).toBe("Login works");
    expect(clonedCases[0]?.tags).toEqual(["smoke"]);
  });
});
