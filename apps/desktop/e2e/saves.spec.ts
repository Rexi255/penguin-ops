// End-to-end tests of saving and resuming (ROADMAP M3.7c, ADR 0106): a new game is saved in its
// slot file at once and the slot shows its details, a game saved on disk is resumed at its
// checkpoint, closing the window saves the game being played, a slot is deleted after the player
// confirmed it, a damaged save locks its slot, and axe-core finds no accessibility violations with
// the slot menu and the dialog open. Export and import are in save-transfer.spec.ts.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "./app";
import { axeViolations } from "./axe";
import { ADA_SAVE, GAME_START_TIME, readSave, savedSoFar, storeSave } from "./saves";

/** Starts a new game of Max in the first slot with the keyboard alone. */
async function startNewGame(page: Page) {
  // The start screen appears once the slots are read.
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "New game" })).toBeVisible();
  await page.keyboard.type("Max");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Command line" })).toBeFocused();
}

test("saves a new game at once and shows its details on the slot", async ({
  page,
  userDataDir,
}) => {
  await startNewGame(page);
  await expect.poll(async () => (await savedSoFar(userDataDir, 1))?.["playerName"]).toBe("Max");
  await page.keyboard.type("cd welcome");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await savedSoFar(userDataDir, 1))?.["tickets"])
    .toEqual([{ level: "first-steps", solved: true, hintsShown: 0, reachedExtraGoals: [] }]);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Main menu" }).click();
  await page.getByRole("button", { name: "Play" }).click();
  const slot = page.getByRole("button", { name: "Slot 1 Max · Career" });
  await expect(slot).toBeFocused();
  await expect(slot).toContainText("1 ticket solved");
  await expect(slot).toContainText("0 min played");
});

test("resumes a saved game at its checkpoint after a restart", async ({ page, userDataDir }) => {
  await storeSave(page, userDataDir, 2, ADA_SAVE);
  await page.getByRole("button", { name: "Play" }).click();
  const slot = page.getByRole("button", { name: "Slot 2 Ada Lovelace · Sandbox" });
  await expect(slot).toContainText("1 ticket solved");
  await expect(slot).toContainText("1 h 15 min played");
  await slot.click();
  await expect(page.getByRole("banner")).toContainText("Step 2 of 2");
  await expect(page.getByRole("article")).toContainText("Hint 1 of 3");
  await page.keyboard.type("ls ~/projects/relaunch");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("log", { name: "Terminal output" })).toContainText("docs  drafts");
});

test("saves the game being played when the window closes", async ({
  electronApp,
  page,
  userDataDir,
}) => {
  await startNewGame(page);
  await page.keyboard.type("pwd");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("log", { name: "Terminal output" })).toContainText("/home/max");
  const closed = electronApp.waitForEvent("close");
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await closed;
  const save = await readSave(userDataDir, 1);
  // The game time of the input is saved, though the input changed no progress.
  expect(save["gameTime"]).toBeGreaterThan(GAME_START_TIME);
});

test("deletes a slot after the player confirmed it", async ({ page, userDataDir }) => {
  await storeSave(page, userDataDir, 1, ADA_SAVE);
  await page.getByRole("button", { name: "Play" }).click();
  await page.keyboard.press("Tab");
  const menuButton = page.getByRole("button", { name: "Actions for slot 1" });
  await expect(menuButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Export" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);

  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Delete slot 1?" });
  await expect(dialog).toContainText("The game of Ada Lovelace will be deleted for good.");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);

  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status")).toHaveText("Slot 1 was deleted.");
  await expect(page.getByRole("button", { name: "Slot 1 New game", exact: true })).toBeFocused();
  await expect(readFile(join(userDataDir, "saves", "slot-1.json"))).rejects.toThrow();
});

test("locks a slot whose save is damaged", async ({ page, userDataDir }) => {
  await storeSave(page, userDataDir, 3, "{ this is no save");
  await page.getByRole("button", { name: "Play" }).click();
  const slot = page.getByRole("button", {
    name: "Slot 3 This save is damaged and cannot be loaded.",
  });
  await expect(slot).toHaveAttribute("aria-disabled", "true");
  await slot.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Choose a save slot" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test.describe("with the locale de-DE", () => {
  test.use({ appLocale: "de-DE" });

  test("shows a saved game's details in German", async ({ page, userDataDir }) => {
    await storeSave(page, userDataDir, 1, ADA_SAVE, "Spielen");
    await page.getByRole("button", { name: "Spielen" }).click();
    const slot = page.getByRole("button", { name: "Spielstand 1 Ada Lovelace · Sandbox" });
    await expect(slot).toContainText("1 Ticket gelöst");
    await expect(slot).toContainText("1 Std. 15 Min. gespielt");
    await expect(slot).toContainText("Zuletzt gespielt: 20.11.2026");
    expect(await axeViolations(page)).toEqual([]);
  });
});
