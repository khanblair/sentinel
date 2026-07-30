import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // All test files share one SQLite file (see test/testDb.ts); running them
    // concurrently would race on the same rows via resetDb's deleteMany calls.
    fileParallelism: false,
    // Real-browser tests are slow/flaky compared to the rest of the suite and would
    // block every other phase's CI run if they flake for reasons unrelated to the
    // code under test — run them separately via `pnpm test:e2e` instead.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.e2e.test.ts"],
  },
});
