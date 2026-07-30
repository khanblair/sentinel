import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // All test files share one SQLite file (see test/testDb.ts); running them
    // concurrently would race on the same rows via resetDb's deleteMany calls.
    fileParallelism: false,
  },
});
