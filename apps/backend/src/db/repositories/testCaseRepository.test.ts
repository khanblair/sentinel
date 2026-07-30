import type { PrismaClient, Suite } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../../test/testDb.js";
import { ValidationError } from "../../errors.js";
import { ProjectRepository } from "./projectRepository.js";
import { SuiteRepository } from "./suiteRepository.js";
import { TestCaseRepository } from "./testCaseRepository.js";

describe("TestCaseRepository", () => {
  let prisma: PrismaClient;
  let repo: TestCaseRepository;
  let suite: Suite;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new TestCaseRepository(prisma);
    const project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
    suite = await new SuiteRepository(prisma).create({ projectId: project.id, name: "Checkout" });
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("round-trips tags as a string array, not a raw JSON string", async () => {
    const created = await repo.create({
      suiteId: suite.id,
      module: "Checkout",
      title: "Apply discount code",
      priority: "P2",
      urlPath: "/cart",
      steps: "1. add item\n2. apply code SAVE10",
      expectedResult: "total reduced by 10%",
      tags: ["regression", "pricing"],
    });

    expect(created.tags).toEqual(["regression", "pricing"]);

    const fetched = await repo.getById(created.id);
    expect(fetched.tags).toEqual(["regression", "pricing"]);
  });

  it("defaults tags to an empty array when omitted", async () => {
    const created = await repo.create({
      suiteId: suite.id,
      module: "Checkout",
      title: "No tags case",
      priority: "P3",
      urlPath: "/cart",
      steps: "1. do thing",
      expectedResult: "thing happens",
    });
    expect(created.tags).toEqual([]);
  });

  it("rejects a missing title", async () => {
    await expect(
      repo.create({
        suiteId: suite.id,
        module: "Checkout",
        title: "  ",
        priority: "P3",
        urlPath: "/cart",
        steps: "1. x",
        expectedResult: "y",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("archive excludes the case from listBySuite by default", async () => {
    const created = await repo.create({
      suiteId: suite.id,
      module: "Checkout",
      title: "Archivable",
      priority: "P3",
      urlPath: "/cart",
      steps: "1. x",
      expectedResult: "y",
    });
    await repo.archive(created.id);
    expect(await repo.listBySuite(suite.id)).toHaveLength(0);
    expect(await repo.listBySuite(suite.id, { includeArchived: true })).toHaveLength(1);
  });

  it("clone preserves tags and appends a (copy) suffix to the title", async () => {
    const created = await repo.create({
      suiteId: suite.id,
      module: "Checkout",
      title: "Original case",
      priority: "P1",
      urlPath: "/cart",
      steps: "1. x",
      expectedResult: "y",
      tags: ["a11y"],
    });
    const cloned = await repo.clone(created.id);
    expect(cloned.title).toBe("Original case (copy)");
    expect(cloned.tags).toEqual(["a11y"]);
  });
});
