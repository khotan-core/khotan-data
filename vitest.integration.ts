import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
