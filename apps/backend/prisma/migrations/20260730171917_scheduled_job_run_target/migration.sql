/*
  Warnings:

  - Added the required column `assistantId` to the `ScheduledJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `ScheduledJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `providerConfigId` to the `ScheduledJob` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduledJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "suiteId" TEXT,
    "scheduleType" TEXT NOT NULL,
    "scheduleExpression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "mode" TEXT NOT NULL DEFAULT 'full_auto',
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assistantId" TEXT NOT NULL,
    "providerConfigId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "environmentId" TEXT,
    CONSTRAINT "ScheduledJob_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "Suite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledJob_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ScheduledJob" ("id", "isActive", "lastRunAt", "mode", "nextRunAt", "scheduleExpression", "scheduleType", "suiteId", "timezone") SELECT "id", "isActive", "lastRunAt", "mode", "nextRunAt", "scheduleExpression", "scheduleType", "suiteId", "timezone" FROM "ScheduledJob";
DROP TABLE "ScheduledJob";
ALTER TABLE "new_ScheduledJob" RENAME TO "ScheduledJob";
CREATE INDEX "ScheduledJob_suiteId_idx" ON "ScheduledJob"("suiteId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
