// Starts the desktop app for a test and closes it afterwards: either the built app (`out/`, run
// by the development Electron) or the packaged app from `npm run package` (ADR 0034).
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

import { LINUX_EXECUTABLE_NAME, OUTPUT_DIRECTORY } from "../electron-builder.config";

export interface AppOptions {
  /**
   * `false`: the built app in `out/`, started with the Electron of the development dependencies.
   * `true`: the unpacked app that `npm run package` writes next to the installer.
   */
  readonly packaged: boolean;
}

/** Options of a single test. */
export interface TestOptions {
  /**
   * The app's locale, passed to Chromium as `--lang`, which also sets `navigator.language`. The
   * tests fix it, so that they do not depend on the language of the system they run on.
   */
  readonly appLocale: string;
}

interface AppFixtures {
  /**
   * The app's per-user data folder, a new empty folder for every test, passed to Electron as
   * `--user-data-dir`. The tests never touch the saves and settings of the person who runs them,
   * and every test starts with empty save slots. Tests that need saves write them here first.
   */
  readonly userDataDir: string;
  readonly electronApp: ElectronApplication;
  readonly page: Page;
}

const appFolder = join(import.meta.dirname, "..");

/** The executable inside the unpacked app that electron-builder writes to release/. */
function packagedExecutable(): string {
  const release = join(appFolder, OUTPUT_DIRECTORY);
  if (process.platform === "win32") {
    return join(release, "win-unpacked", "PenguinOps.exe");
  }
  if (process.platform === "linux") {
    return join(release, "linux-unpacked", LINUX_EXECUTABLE_NAME);
  }
  throw new Error(`The packaged app is not built for ${process.platform} (ADR 0002).`);
}

// `page` replaces Playwright's browser page with the app window, so no browser is started.
export const test = base.extend<AppFixtures & TestOptions, AppOptions>({
  packaged: [false, { option: true, scope: "worker" }],
  appLocale: ["en-US", { option: true }],
  // The folder name shows the test's locale, which helps when a failed test leaves it behind.
  userDataDir: async ({ appLocale }, use) => {
    const folder = await mkdtemp(join(tmpdir(), `penguin-ops-e2e-${appLocale}-`));
    await use(folder);
    await rm(folder, { recursive: true, force: true });
  },
  electronApp: async ({ packaged, appLocale, userDataDir }, use) => {
    // ELECTRON_RUN_AS_NODE (set for example by VS Code extension hosts) would start Electron as
    // plain Node.js without a window.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[0] !== "ELECTRON_RUN_AS_NODE" && entry[1] !== undefined,
      ),
    );
    const args = [`--lang=${appLocale}`, `--user-data-dir=${userDataDir}`];
    let app: ElectronApplication;
    if (packaged) {
      const executablePath = packagedExecutable();
      if (!existsSync(executablePath)) {
        throw new Error(`${executablePath} does not exist. Run "npm run package" first.`);
      }
      app = await electron.launch({ executablePath, args, env });
    } else {
      // Electron starts the "main" file of the app folder's package.json (the built main process).
      // Chromium switches come before the app folder.
      app = await electron.launch({ args: [...args, appFolder], env });
    }
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
