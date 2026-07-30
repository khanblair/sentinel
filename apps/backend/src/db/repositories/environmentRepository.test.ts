import type { PrismaClient, Project } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../../test/testDb.js";
import { ValidationError } from "../../errors.js";
import { EnvironmentRepository } from "./environmentRepository.js";
import { ProjectRepository } from "./projectRepository.js";

describe("EnvironmentRepository", () => {
  let prisma: PrismaClient;
  let repo: EnvironmentRepository;
  let project: Project;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new EnvironmentRepository(prisma);
    project = await new ProjectRepository(prisma).create({ name: "SoundWave" });
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("creates an environment with a valid base URL", async () => {
    const env = await repo.create({ projectId: project.id, name: "Staging", baseUrl: "https://staging.example.com" });
    expect(env.baseUrl).toBe("https://staging.example.com");
  });

  it("rejects an invalid base URL", async () => {
    await expect(
      repo.create({ projectId: project.id, name: "Bad", baseUrl: "not-a-url" }),
    ).rejects.toThrow(ValidationError);
  });

  it("stores credentialsProfile as serialized JSON and round-trips it via update", async () => {
    const env = await repo.create({
      projectId: project.id,
      name: "Staging",
      baseUrl: "https://staging.example.com",
      credentialsProfile: { username: "tester" },
    });
    expect(env.credentialsProfile).toBe(JSON.stringify({ username: "tester" }));

    const updated = await repo.update(env.id, { credentialsProfile: { username: "tester2" } });
    expect(updated.credentialsProfile).toBe(JSON.stringify({ username: "tester2" }));
  });
});
