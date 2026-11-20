// End-to-end tests of export and import (ROADMAP M3.7d, ADR 0107): Export writes a slot's save to
// the file the player chose in the system's dialog, Import reads a chosen file into an empty slot
// or, after the player confirmed it, over a saved game, and a file that is no save leaves the slot
// alone. The tests replace the system's file dialogs in the main process with answers of their
// own, because Playwright cannot click in a native dialog.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ElectronApplication } from "@playwright/test";

import { expect, test } from "./app";
import { axeViolations } from "./axe";
import { ADA_SAVE, storeSave } from "./saves";

/** Makes the save dialog answer with `path` and records the options it was shown with. */
async function answerSaveDialog(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, filePath) => {
    const shown: unknown[] = [];
    Object.assign(globalThis, { shownSaveDialogs: shown });
    dialog.showSaveDialog = (...args: unknown[]) => {
      shown.push(args.at(-1));
      return Promise.resolve({ canceled: false, filePath });
    };
  }, path);
}

/** Makes the open dialog answer with `path`. */
async function answerOpenDialog(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [filePath] });
  }, path);
}

test("exports a slot's game to the chosen file", async ({ electronApp, page, userDataDir }) => {
  await storeSave(page, userDataDir, 1, ADA_SAVE);
  const target = join(userDataDir, "exported.json");
  await answerSaveDialog(electronApp, target);
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Actions for slot 1" }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  await expect(page.getByRole("status")).toHaveText("Slot 1 was exported.");
  expect(await readFile(target, "utf8")).toBe(ADA_SAVE);
  const shown = await electronApp.evaluate(
    () => (globalThis as unknown as { shownSaveDialogs: unknown[] }).shownSaveDialogs,
  );
  expect(shown).toEqual([
    expect.objectContaining({
      title: "Export slot 1",
      filters: [{ name: "PenguinOps save", extensions: ["json"] }],
    }),
  ]);
});

test("imports a file into an empty slot", async ({ electronApp, page, userDataDir }) => {
  const source = join(userDataDir, "ada.json");
  await writeFile(source, ADA_SAVE);
  await answerOpenDialog(electronApp, source);
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Actions for slot 2" }).click();
  await page.getByRole("menuitem", { name: "Import" }).click();
  await expect(page.getByRole("status")).toHaveText("The game was imported into slot 2.");
  await expect(page.getByRole("button", { name: "Slot 2 Ada Lovelace · Sandbox" })).toBeVisible();
  expect(await readFile(join(userDataDir, "saves", "slot-2.json"), "utf8")).toBe(ADA_SAVE);
});

test("asks before an import replaces a saved game", async ({ electronApp, page, userDataDir }) => {
  await storeSave(page, userDataDir, 1, ADA_SAVE);
  const source = join(userDataDir, "zoe.json");
  await writeFile(source, ADA_SAVE.replace("Ada Lovelace", "Zoë Müller"));
  await answerOpenDialog(electronApp, source);
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Actions for slot 1" }).click();
  await page.getByRole("menuitem", { name: "Import" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Replace slot 1?" });
  await expect(dialog).toContainText(
    "The game of Ada Lovelace will be replaced by the game of Zoë Müller.",
  );
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
  await dialog.getByRole("button", { name: "Replace" }).click();
  await expect(page.getByRole("status")).toHaveText("The game was imported into slot 1.");
  await expect(page.getByRole("button", { name: "Slot 1 Zoë Müller · Sandbox" })).toBeFocused();
});

test("leaves the slot alone when the file is no save", async ({
  electronApp,
  page,
  userDataDir,
}) => {
  const source = join(userDataDir, "notes.json");
  await writeFile(source, '{"notes": "not a save"}');
  await answerOpenDialog(electronApp, source);
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Actions for slot 1" }).click();
  await page.getByRole("menuitem", { name: "Import" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "The file is not a PenguinOps save. Slot 1 is unchanged.",
  );
  await expect(page.getByRole("button", { name: "Slot 1 New game", exact: true })).toBeVisible();
});
