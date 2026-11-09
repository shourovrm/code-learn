import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 180_000,
    hookTimeout: 900_000,
    // Sandbox tests count the scopes code-learn owns, so files must not overlap.
    fileParallelism: false,
  },
});
