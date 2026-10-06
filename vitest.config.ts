import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    // Database tests create their own throwaway databases, so files can run in parallel.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
