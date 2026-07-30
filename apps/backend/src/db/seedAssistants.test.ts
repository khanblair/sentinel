import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../test/testDb.js";
import { BUILT_IN_ASSISTANTS, seedBuiltInAssistants } from "./seedAssistants.js";

describe("seedBuiltInAssistants", () => {
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

  it("creates one row per built-in assistant", async () => {
    await seedBuiltInAssistants(prisma);
    const rows = await prisma.assistant.findMany({ where: { isBuiltIn: true } });
    expect(rows).toHaveLength(BUILT_IN_ASSISTANTS.length);
    expect(rows.map((row) => row.name).sort()).toEqual(
      BUILT_IN_ASSISTANTS.map((a) => a.name).sort(),
    );
  });

  it("is idempotent: running it twice doesn't create duplicates", async () => {
    await seedBuiltInAssistants(prisma);
    await seedBuiltInAssistants(prisma);
    const rows = await prisma.assistant.findMany({ where: { isBuiltIn: true } });
    expect(rows).toHaveLength(BUILT_IN_ASSISTANTS.length);
  });

  it("does not disturb a user-created custom Assistant with the same isBuiltIn=false", async () => {
    await prisma.assistant.create({
      data: { name: "My Custom Assistant", systemPrompt: "custom", isBuiltIn: false },
    });
    await seedBuiltInAssistants(prisma);
    const custom = await prisma.assistant.findFirst({ where: { name: "My Custom Assistant" } });
    expect(custom).not.toBeNull();
    expect(custom?.isBuiltIn).toBe(false);
  });
});
