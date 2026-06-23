import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts", "src/**/index.ts"],
      // Floor set near current coverage (~54% lines, ~48% branches) to keep CI
      // honest; ratchet upward as tests are added. Branches sits just under 50%.
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 50,
        lines: 50,
      },
    },
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
  },
});
