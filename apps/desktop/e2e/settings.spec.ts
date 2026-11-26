// End-to-end tests of the settings file (ROADMAP M3.8a, ADR 0108): the preload API stores the
// settings in the per-user data folder and reads them back, the main process rejects what is no
// text, and the game takes its language from the settings instead of the system's locale. A
// broken settings file does not stop the game from starting. The settings screen changes the
// language and fullscreen and stores them; F11 toggles fullscreen in the main process (ADR 0109).
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SettingsFileApi } from "@penguin-ops/ui";
import type { ElectronApplication } from "@playwright/test";

import { expect, test } from "./app";
import { axeViolations } from "./axe";

/** The page's window with the preload API; only types, so it can be used inside `evaluate`. */
type AppWindow = Window & { readonly penguinOps: { readonly settings: SettingsFileApi } };

/** A settings file of format version 1 with the language `language`. */
function settingsWithLanguage(language: string): string {
  return `${JSON.stringify(
    {
      format: "penguin-ops-settings",
      version: 1,
      language,
      volumes: { master: 80, music: 50, effects: 80 },
      fullscreen: true,
      fontSize: 100,
      colorScheme: "default",
      effects: { glow: false, scanlines: false },
      reduceMotion: "system",
    },
    undefined,
    2,
  )}\n`;
}

test("writes and reads the settings file in the per-user data folder", async ({
  page,
  userDataDir,
}) => {
  const read = await page.evaluate(async () => {
    const api = (window as unknown as AppWindow).penguinOps.settings;
    const before = await api.read();
    await api.write("first\n");
    await api.write("second\n");
    return { before, after: await api.read() };
  });
  expect(read).toEqual({
    before: { kind: "missing" },
    after: { kind: "text", text: "second\n" },
  });
  expect(await readFile(join(userDataDir, "settings.json"), "utf8")).toBe("second\n");
});

test("rejects settings that are no text", async ({ page, userDataDir }) => {
  const error = await page.evaluate(async () => {
    try {
      const api = (window as unknown as AppWindow).penguinOps.settings;
      await api.write({ language: "de" } as unknown as string);
      return "written";
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  });
  expect(error).toContain("The settings must be a text.");
  expect(await readdir(userDataDir)).not.toContain("settings.json");
});

test.describe("on an English system", () => {
  test.use({ appLocale: "en-US" });

  test("speaks the language of the settings", async ({ page, userDataDir }) => {
    await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
    await writeFile(join(userDataDir, "settings.json"), settingsWithLanguage("de"));
    await page.reload();
    await expect(page.getByRole("button", { name: "Spielen" })).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("starts in the system's language with a broken settings file", async ({
    page,
    userDataDir,
  }) => {
    await writeFile(join(userDataDir, "settings.json"), "{ broken");
    await page.reload();
    await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  });
});

test.describe("on a German system", () => {
  test.use({ appLocale: "de-DE" });

  test("speaks English when the settings say so", async ({ page, userDataDir }) => {
    await expect(page.getByRole("button", { name: "Spielen" })).toBeFocused();
    await writeFile(join(userDataDir, "settings.json"), settingsWithLanguage("en"));
    await page.reload();
    await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  });
});

// The settings screen and fullscreen (ROADMAP M3.8b, ADR 0109).

/** The settings in the settings file of `userDataDir`, or `undefined` while there is none. */
async function storedSettings(userDataDir: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(userDataDir, "settings.json"), "utf8"));
  } catch {
    return undefined;
  }
}

test("shows the window once the renderer has read the settings", async ({ electronApp, page }) => {
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()),
    )
    .toBe(true);
});

test("switches the language in the settings screen and stores it", async ({
  page,
  userDataDir,
}) => {
  await page.getByRole("button", { name: "Settings" }).click();
  // Without a settings file, the game follows the system's language.
  await expect(page.getByRole("radio", { name: "System language (English)" })).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
  await expect.poll(() => storedSettings(userDataDir)).toMatchObject({ language: "en" });
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect.poll(() => storedSettings(userDataDir)).toMatchObject({ language: "de" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Einstellungen" })).toBeFocused();
});

test("leaves fullscreen with the switch in the settings and stores it", async ({
  electronApp,
  page,
  userDataDir,
}) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const fullscreen = page.getByRole("checkbox", { name: "Fullscreen" });
  await expect(fullscreen).toBeChecked();
  await fullscreen.focus();
  await page.keyboard.press("Space");
  await expect(fullscreen).not.toBeChecked();
  await expect.poll(() => storedSettings(userDataDir)).toMatchObject({ fullscreen: false });
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen()),
    )
    .toBe(false);
});

/**
 * Presses F11 as the system does. Playwright's keyboard sends its keys through the DevTools
 * protocol, which Electron's `before-input-event` does not see; `sendInputEvent` takes the way
 * of a real key press.
 */
async function pressF11(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.sendInputEvent({ type: "keyDown", keyCode: "F11" });
    contents?.sendInputEvent({ type: "keyUp", keyCode: "F11" });
  });
}

test("toggles fullscreen with F11 without the page seeing the key, and stores it", async ({
  electronApp,
  page,
  userDataDir,
}) => {
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  await page.evaluate(() => {
    const seen: string[] = [];
    Reflect.set(window, "seenKeys", seen);
    document.addEventListener("keydown", (event) => {
      seen.push(event.key);
    });
  });
  await pressF11(electronApp);
  await expect.poll(() => storedSettings(userDataDir)).toMatchObject({ fullscreen: false });
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("checkbox", { name: "Fullscreen" })).not.toBeChecked();
  await pressF11(electronApp);
  await expect(page.getByRole("checkbox", { name: "Fullscreen" })).toBeChecked();
  await expect.poll(() => storedSettings(userDataDir)).toMatchObject({ fullscreen: true });
  expect(await page.evaluate(() => Reflect.get(window, "seenKeys") as unknown)).not.toContain(
    "F11",
  );
});
