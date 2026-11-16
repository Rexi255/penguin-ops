// Playwright configuration for the desktop end-to-end tests (ADR 0015, ADR 0033). The tests
// start the built app (`out/`) with Electron; `npm run e2e` builds it first. No browser download
// is needed, because Playwright drives Electron's own Chromium.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  // One Electron instance at a time: the tests share the user data folder of the app.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  outputDir: "test-results",
});
