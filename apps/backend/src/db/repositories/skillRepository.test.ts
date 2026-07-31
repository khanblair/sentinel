import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../../test/testDb.js";
import { NotFoundError, ValidationError } from "../../errors.js";
import { SkillRepository } from "./skillRepository.js";

describe("SkillRepository", () => {
  let prisma: PrismaClient;
  let repo: SkillRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new SkillRepository(prisma);
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("creates a custom (non-built-in) skill", async () => {
    const skill = await repo.create({ name: "custom-check", definition: "Do a custom thing" });
    expect(skill.isBuiltIn).toBe(false);
  });

  it("rejects a duplicate skill name", async () => {
    await repo.create({ name: "custom-check", definition: "x" });
    await expect(repo.create({ name: "custom-check", definition: "y" })).rejects.toThrow(ValidationError);
  });

  it("rejects empty name or definition", async () => {
    await expect(repo.create({ name: "", definition: "x" })).rejects.toThrow(ValidationError);
    await expect(repo.create({ name: "x", definition: "" })).rejects.toThrow(ValidationError);
  });

  it("lists built-ins before custom skills, alphabetically within each group", async () => {
    await repo.create({ name: "zzz-custom", definition: "x" });
    await prisma.skill.create({ data: { name: "aaa-builtin", definition: "y", isBuiltIn: true } });

    const list = await repo.list();
    expect(list.map((s) => s.name)).toEqual(["aaa-builtin", "zzz-custom"]);
  });

  it("deletes a custom skill", async () => {
    const skill = await repo.create({ name: "custom-check", definition: "x" });
    await repo.delete(skill.id);
    expect(await repo.list()).toHaveLength(0);
  });

  it("refuses to delete a built-in skill", async () => {
    const builtIn = await prisma.skill.create({ data: { name: "network-assertion", definition: "x", isBuiltIn: true } });
    await expect(repo.delete(builtIn.id)).rejects.toThrow(ValidationError);
  });

  it("404s deleting a skill that doesn't exist", async () => {
    await expect(repo.delete("missing")).rejects.toThrow(NotFoundError);
  });
});
