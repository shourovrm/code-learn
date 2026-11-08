import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 180_000,
    hookTimeout: 900_000,
    // Docker tests count the containers code-learn owns, so files must not overlap.
    fileParallelism: false,
  },
});
