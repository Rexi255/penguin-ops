// Vitest configuration for the whole repository (ADR 0015, ADR 0030). Every workspace that has
// tests becomes one project here; `npm test` runs all of them.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "engine",
          include: ["packages/engine/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "content",
          include: ["packages/content/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "gameplay",
          include: ["packages/gameplay/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "desktop",
          include: ["apps/desktop/src/**/*.test.ts", "apps/desktop/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "tooling",
          include: ["scripts/**/*.test.ts"],
          environment: "node",
          // Each lint-rules case starts the TypeScript project service; the first one is slow.
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}", "apps/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        // ADR 0015: the engine needs at least 90 % in every metric.
        "packages/engine/src/**": { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
});
