// Playwright configuration of the styleguide's browser tests (ROADMAP M3.0c, ADR 0083). Unlike the
// desktop end-to-end tests they run in Playwright's own Chromium against the development server,
// because the styleguide is a web page and not part of the app.
import { defineConfig, devices } from "@playwright/test";

import { STYLEGUIDE_PORT } from "./vite.config";

const baseURL = `http://localhost:${String(STYLEGUIDE_PORT)}`;

// An installed Chromium to use instead of Playwright's download, for machines that cannot download
// it (for example a cloud container with a preinstalled browser). CI and normal machines leave it
// unset and run `npx playwright install chromium` once.
const executablePath = process.env["STYLEGUIDE_CHROMIUM_PATH"];

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  outputDir: "test-results",
  use: { baseURL },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
      },
    },
  ],
  webServer: {
    command: "vite",
    cwd: import.meta.dirname,
    url: `${baseURL}/styleguide.html`,
    // Locally a running `npm run styleguide` is reused; CI always starts its own server.
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 60_000,
  },
});
