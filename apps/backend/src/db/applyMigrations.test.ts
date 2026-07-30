import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { applyPendingMigrations } from "./applyMigrations.js";

const TEST_DB_PATH = join(process.cwd(), "prisma", "apply-migrations-test.db");
const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

describe("applyPendingMigrations", () => {
  afterAll(() => {
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH);
    }
  });

  it("applies every migration in the repo to a fresh database", async () => {
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH);
    }
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${TEST_DB_PATH}` } } });
    try {
      await applyPendingMigrations(prisma, MIGRATIONS_DIR);
      // If the schema applied correctly, these are queryable without error.
      await expect(prisma.project.findMany()).resolves.toEqual([]);
      await expect(prisma.run.findMany()).resolves.toEqual([]);
      await expect(prisma.scheduledJob.findMany()).resolves.toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("is idempotent — running it again against an already-migrated database does not error", async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${TEST_DB_PATH}` } } });
    try {
      await expect(applyPendingMigrations(prisma, MIGRATIONS_DIR)).resolves.toBeUndefined();
      const applied = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*) as count FROM "_prisma_migrations"`,
      );
      expect(applied[0]?.count).toBeGreaterThan(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("does nothing (no throw) when the migrations directory doesn't exist", async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: "file:./prisma/does-not-matter.db" } } });
    try {
      await expect(
        applyPendingMigrations(prisma, join(process.cwd(), "no-such-migrations-dir")),
      ).resolves.toBeUndefined();
    } finally {
      await prisma.$disconnect();
    }
  });
});
