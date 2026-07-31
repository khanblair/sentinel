import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../test/testDb.js";
import { BUILT_IN_SKILLS, seedBuiltInSkills } from "./seedSkills.js";

describe("seedBuiltInSkills", () => {
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

  it("creates one row per built-in skill", async () => {
    await seedBuiltInSkills(prisma);
    const rows = await prisma.skill.findMany({ where: { isBuiltIn: true } });
    expect(rows).toHaveLength(BUILT_IN_SKILLS.length);
    expect(rows.map((row) => row.name).sort()).toEqual(BUILT_IN_SKILLS.map((s) => s.name).sort());
  });

  it("is idempotent: running it twice doesn't create duplicates", async () => {
    await seedBuiltInSkills(prisma);
    await seedBuiltInSkills(prisma);
    const rows = await prisma.skill.findMany({ where: { isBuiltIn: true } });
    expect(rows).toHaveLength(BUILT_IN_SKILLS.length);
  });

  it("does not disturb a user-created custom Skill", async () => {
    await prisma.skill.create({ data: { name: "my-custom-skill", definition: "custom", isBuiltIn: false } });
    await seedBuiltInSkills(prisma);
    const custom = await prisma.skill.findFirst({ where: { name: "my-custom-skill" } });
    expect(custom).not.toBeNull();
    expect(custom?.isBuiltIn).toBe(false);
  });
});
