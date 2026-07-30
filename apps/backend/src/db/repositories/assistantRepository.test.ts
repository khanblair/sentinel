import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../../test/testDb.js";
import { seedBuiltInAssistants } from "../seedAssistants.js";
import { AssistantRepository } from "./assistantRepository.js";

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
});
