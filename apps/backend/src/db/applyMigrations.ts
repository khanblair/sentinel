import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";

/**
 * Manually applies any pending migration.sql files, mirroring `prisma migrate
 * deploy`. A packaged desktop app has no CLI step a user runs — migrations must
 * apply themselves on boot, or the app is broken on every fresh install. Tracks
 * applied migrations in the same `_prisma_migrations` table the real CLI uses, so
 * this stays compatible with `prisma migrate deploy` if one is ever run against the
 * same database (e.g. during development).
 */
export async function applyPendingMigrations(prisma: PrismaClient, migrationsDir: string): Promise<void> {
  if (!existsSync(migrationsDir)) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
  );
  const appliedNames = new Set(applied.map((row) => row.migration_name));

  const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of migrationDirs) {
    if (appliedNames.has(name)) {
      continue;
    }
    const sqlPath = join(migrationsDir, name, "migration.sql");
    if (!existsSync(sqlPath)) {
      continue;
    }

    const sql = readFileSync(sqlPath, "utf8");
    const statements = sql
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (?, ?, current_timestamp, ?, ?)`,
      randomUUID(),
      "manual",
      name,
      statements.length,
    );
  }
}
