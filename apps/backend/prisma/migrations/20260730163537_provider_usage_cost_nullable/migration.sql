-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProviderUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "estimatedCostUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderUsage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProviderUsage" ("completionTokens", "createdAt", "estimatedCostUsd", "id", "model", "promptTokens", "provider", "runId") SELECT "completionTokens", "createdAt", "estimatedCostUsd", "id", "model", "promptTokens", "provider", "runId" FROM "ProviderUsage";
DROP TABLE "ProviderUsage";
ALTER TABLE "new_ProviderUsage" RENAME TO "ProviderUsage";
CREATE INDEX "ProviderUsage_runId_idx" ON "ProviderUsage"("runId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
