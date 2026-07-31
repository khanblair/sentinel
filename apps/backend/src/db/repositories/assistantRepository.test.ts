import type { PrismaClient, Project } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../../test/testDb.js";
import { NotFoundError, ValidationError } from "../../errors.js";
import { seedBuiltInAssistants } from "../seedAssistants.js";
import { AssistantRepository } from "./assistantRepository.js";
import { ProjectRepository } from "./projectRepository.js";

describe("AssistantRepository", () => {
  let prisma: PrismaClient;
  let repo: AssistantRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new AssistantRepository(prisma);
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("lists seeded built-in assistants with defaultSkills parsed as an array", async () => {
    await seedBuiltInAssistants(prisma);
    const list = await repo.list();
    expect(list.length).toBeGreaterThan(0);
    const accessibility = list.find((a) => a.name === "Accessibility Auditor");
    expect(accessibility?.defaultSkills).toEqual(["accessibility-audit"]);
    expect(accessibility?.isBuiltIn).toBe(true);
  });

  it("lists built-ins before custom assistants", async () => {
    await seedBuiltInAssistants(prisma);
    await prisma.assistant.create({ data: { name: "AAA Custom", systemPrompt: "x", isBuiltIn: false } });
    const list = await repo.list();
    expect(list[0]?.isBuiltIn).toBe(true);
  });

  it("creates a custom assistant, not built-in, with defaultSkills stored as JSON", async () => {
    const created = await repo.create({ name: "My Assistant", systemPrompt: "Be careful", defaultSkills: ["visual-diff"] });
    expect(created.isBuiltIn).toBe(false);
    expect(created.defaultSkills).toEqual(["visual-diff"]);
  });

  it("rejects an empty name or system prompt", async () => {
    await expect(repo.create({ name: "", systemPrompt: "x" })).rejects.toThrow(ValidationError);
    await expect(repo.create({ name: "x", systemPrompt: "" })).rejects.toThrow(ValidationError);
  });

  it("scopes an assistant to a real project, and 404s for a project that doesn't exist", async () => {
    const project: Project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
    const scoped = await repo.create({ name: "Scoped", systemPrompt: "x", projectId: project.id });
    expect(scoped.projectId).toBe(project.id);

    await expect(repo.create({ name: "x", systemPrompt: "y", projectId: "missing" })).rejects.toThrow(NotFoundError);
  });

  it("deletes a custom assistant, and refuses to delete a built-in one", async () => {
    await seedBuiltInAssistants(prisma);
    const custom = await repo.create({ name: "Deletable", systemPrompt: "x" });
    await repo.delete(custom.id);

    const builtIn = (await repo.list()).find((a) => a.isBuiltIn);
    await expect(repo.delete(builtIn!.id)).rejects.toThrow(ValidationError);
  });

  it("404s deleting an assistant that doesn't exist", async () => {
    await expect(repo.delete("missing")).rejects.toThrow(NotFoundError);
  });
});
