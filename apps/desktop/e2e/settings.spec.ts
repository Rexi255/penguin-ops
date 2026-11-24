// End-to-end tests of the settings file (ROADMAP M3.8a, ADR 0108): the preload API stores the
// settings in the per-user data folder and reads them back, the main process rejects what is no
// text, and the game takes its language from the settings instead of the system's locale. A
// broken settings file does not stop the game from starting.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SettingsFileApi } from "@penguin-ops/ui";

import { expect, test } from "./app";

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
