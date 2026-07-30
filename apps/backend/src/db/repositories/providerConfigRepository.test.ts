import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb } from "../../test/testDb.js";
import { ValidationError } from "../../errors.js";
import { ProviderConfigRepository } from "./providerConfigRepository.js";

describe("ProviderConfigRepository", () => {
  let prisma: PrismaClient;
  let repo: ProviderConfigRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    repo = new ProviderConfigRepository(prisma, randomBytes(32));
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it("never returns the raw API key from create()", async () => {
    const created = await repo.create({ provider: "claude", apiKey: "sk-secret-value" });
    expect(JSON.stringify(created)).not.toContain("sk-secret-value");
  });

  it("round-trips the API key through encryption for internal use", async () => {
    const created = await repo.create({ provider: "openai", apiKey: "sk-another-secret" });
    const decrypted = await repo.getDecryptedApiKey(created.id);
    expect(decrypted.apiKey).toBe("sk-another-secret");
    expect(decrypted.provider).toBe("openai");
  });

  it("rejects an unknown provider name", async () => {
    await expect(
      repo.create({ provider: "not-a-provider" as never, apiKey: "sk-x" }),
    ).rejects.toThrow(ValidationError);
  });

  it("list() never includes the encrypted key field", async () => {
    await repo.create({ provider: "gemini", apiKey: "sk-y", label: "personal" });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain("apiKeyEncrypted");
  });
});
