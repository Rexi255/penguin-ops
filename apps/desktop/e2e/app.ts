// Starts the built desktop app for a test and closes it afterwards.
import { join } from "node:path";

import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

interface AppFixtures {
  readonly electronApp: ElectronApplication;
  readonly page: Page;
}

// `page` replaces Playwright's browser page with the app window, so no browser is started.
export const test = base.extend<AppFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern, and this fixture has none.
  electronApp: async ({}, use) => {
    // ELECTRON_RUN_AS_NODE (set for example by VS Code extension hosts) would start Electron as
    // plain Node.js without a window.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[0] !== "ELECTRON_RUN_AS_NODE" && entry[1] !== undefined,
      ),
    );
    // The app folder: Electron starts the "main" file of its package.json (the built main process).
    const app = await electron.launch({ args: [join(import.meta.dirname, "..")], env });
    await use(app);
    await app.close();
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await use(page);
  },
});

export { expect } from "@playwright/test";
