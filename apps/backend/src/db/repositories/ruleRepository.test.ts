import type { PrismaClient, Project } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../../test/testDb.js";
import { NotFoundError, ValidationError } from "../../errors.js";
import { RuleRepository } from "./ruleRepository.js";
import { ProjectRepository } from "./projectRepository.js";

describe("RuleRepository", () => {
  let prisma: PrismaClient;
  let repo: RuleRepository;
  let project: Project;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new RuleRepository(prisma);
    project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("creates a global rule with no projectId", async () => {
    const rule = await repo.create({ scope: "global", text: "Never submit real payment forms" });
    expect(rule.projectId).toBeNull();
  });

  it("creates a project rule scoped to a real project", async () => {
    const rule = await repo.create({ scope: "project", projectId: project.id, text: "Nav collapses below 768px" });
    expect(rule.projectId).toBe(project.id);
  });

  it("rejects a project rule with no projectId", async () => {
    await expect(repo.create({ scope: "project", text: "x" })).rejects.toThrow(ValidationError);
  });

  it("rejects a global rule that carries a projectId", async () => {
    await expect(repo.create({ scope: "global", projectId: project.id, text: "x" })).rejects.toThrow(ValidationError);
  });

  it("rejects a project rule for a project that doesn't exist", async () => {
    await expect(repo.create({ scope: "project", projectId: "missing", text: "x" })).rejects.toThrow(NotFoundError);
  });

  it("rejects empty rule text", async () => {
    await expect(repo.create({ scope: "global", text: "   " })).rejects.toThrow(ValidationError);
  });

  it("listGlobal and listByProject only return rules in their own scope", async () => {
    await repo.create({ scope: "global", text: "Global rule" });
    await repo.create({ scope: "project", projectId: project.id, text: "Project rule" });

    const globalRules = await repo.listGlobal();
    expect(globalRules).toHaveLength(1);
    expect(globalRules[0]?.text).toBe("Global rule");

    const projectRules = await repo.listByProject(project.id);
    expect(projectRules).toHaveLength(1);
    expect(projectRules[0]?.text).toBe("Project rule");
  });

  it("deletes a rule, and 404s deleting one that doesn't exist", async () => {
    const rule = await repo.create({ scope: "global", text: "x" });
    await repo.delete(rule.id);
    expect(await repo.listGlobal()).toHaveLength(0);
    await expect(repo.delete(rule.id)).rejects.toThrow(NotFoundError);
  });
});
