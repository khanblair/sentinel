import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../../test/testDb.js";
import { NotFoundError, ValidationError } from "../../errors.js";
import { ProjectRepository } from "./projectRepository.js";

describe("ProjectRepository", () => {
  let prisma: PrismaClient;
  let repo: ProjectRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new ProjectRepository(prisma);
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("creates and retrieves a project", async () => {
    const created = await repo.create({ name: "SoundWave", description: "music app" });
    expect(created.id).toBeTruthy();

    const fetched = await repo.getById(created.id);
    expect(fetched.name).toBe("SoundWave");
    expect(fetched.description).toBe("music app");
  });

  it("trims whitespace from the name", async () => {
    const created = await repo.create({ name: "  Padded  " });
    expect(created.name).toBe("Padded");
  });

  it("rejects an empty name", async () => {
    await expect(repo.create({ name: "   " })).rejects.toThrow(ValidationError);
  });

  it("lists projects newest first", async () => {
    await repo.create({ name: "First" });
    await repo.create({ name: "Second" });
    const list = await repo.list();
    expect(list.map((project) => project.name)).toEqual(["Second", "First"]);
  });

  it("throws NotFoundError for a missing id", async () => {
    await expect(repo.getById("does-not-exist")).rejects.toThrow(NotFoundError);
  });

  it("updates a project's fields", async () => {
    const created = await repo.create({ name: "Original" });
    const updated = await repo.update(created.id, { name: "Renamed" });
    expect(updated.name).toBe("Renamed");
  });

  it("rejects updating to an empty name", async () => {
    const created = await repo.create({ name: "Original" });
    await expect(repo.update(created.id, { name: "   " })).rejects.toThrow(ValidationError);
  });

  it("deletes a project", async () => {
    const created = await repo.create({ name: "ToDelete" });
    await repo.delete(created.id);
    await expect(repo.getById(created.id)).rejects.toThrow(NotFoundError);
  });
});
