// Playwright configuration for the desktop end-to-end tests (ADR 0015, ADR 0033, ADR 0034). No
// browser download is needed, because Playwright drives Electron's own Chromium. Two projects run
// the same tests:
// - "built": the built app in out/ with the development Electron (`npm run e2e` builds it first);
// - "packaged": the unpacked app that `npm run package` leaves in release/ (`npm run e2e:packaged`).
import { defineConfig } from "@playwright/test";

import type { AppOptions } from "./e2e/app";

export default defineConfig<AppOptions>({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  // One Electron instance at a time; every test has a user data folder of its own (e2e/app.ts),
  // but several Electron windows at once make the timing of the tests unreliable.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  outputDir: "test-results",
  projects: [
    { name: "built", use: { packaged: false } },
    { name: "packaged", use: { packaged: true } },
  ],
});
