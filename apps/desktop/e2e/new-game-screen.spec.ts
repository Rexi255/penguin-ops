// End-to-end tests of the new game screen (ROADMAP M3.2b, ADR 0094): an empty slot opens it with
// the name field focused, the user name follows the name, a reserved user name is explained and
// blocks Start, the mode cards choose the mode, Start fills the slot, Back and Esc return to the
// slot, and axe-core finds no accessibility violations, without and with a problem shown.
import type { Page } from "@playwright/test";

import { expect, test } from "./app";
import { axeViolations } from "./axe";

const LANGUAGES = [
  {
    locale: "en-US",
    firstSlot: "Slot 1 New game",
    title: "New game",
    playerName: "Your name",
    userName: "Linux user name",
    story: "Career",
    sandbox: "Sandbox",
    reserved: "The name root is already taken on the system.",
    filledSlot: "Slot 1 Jörg Müller · Sandbox",
  },
  {
    locale: "de-DE",
    firstSlot: "Spielstand 1 Neues Spiel",
    title: "Neues Spiel",
    playerName: "Dein Name",
    userName: "Linux-Benutzername",
    story: "Karriere",
    sandbox: "Sandbox",
    reserved: "Den Namen root gibt es im System schon.",
    filledSlot: "Spielstand 1 Jörg Müller · Sandbox",
  },
] as const;

/**
 * Goes from the start screen to the new game screen of the first slot with the keyboard alone,
 * waiting for each focus, so that no key press arrives before the screen that should answer it.
 */
async function openNewGame(page: Page): Promise<void> {
  await expect(page.locator("button:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".save-slot:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".field__input:focus")).toHaveCount(1);
}

for (const language of LANGUAGES) {
  test.describe(`with the locale ${language.locale}`, () => {
    test.use({ appLocale: language.locale });

    test("opens with the name field focused and derives the user name", async ({ page }) => {
      await openNewGame(page);
      await expect(page.getByRole("heading", { level: 1, name: language.title })).toBeVisible();
      await expect(page.getByRole("textbox", { name: language.playerName })).toBeFocused();
      await expect(page.getByRole("radio", { name: language.story })).toBeChecked();
      await page.keyboard.type("Jörg Müller");
      await expect(page.getByRole("textbox", { name: language.userName })).toHaveValue(
        "joerg-mueller",
      );
    });

    test("explains a reserved user name and does not start", async ({ page }) => {
      await openNewGame(page);
      await page.keyboard.type("Root");
      await page.keyboard.press("Enter");
      const userName = page.getByRole("textbox", { name: language.userName });
      await expect(userName).toBeFocused();
      await expect(userName).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByText(language.reserved)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: language.title })).toBeVisible();
    });

    test("puts the game into the slot", async ({ page }) => {
      await openNewGame(page);
      await page.keyboard.type("Jörg Müller");
      await page.getByText(language.sandbox, { exact: true }).click();
      await expect(page.getByRole("radio", { name: language.sandbox })).toBeChecked();
      await page.getByRole("textbox", { name: language.playerName }).press("Enter");
      await expect(page.locator(".terminal__input:focus")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await page.locator(".pause-menu button").last().click();
      await page.locator(".menu button").first().click();
      await expect(page.getByRole("button", { name: language.filledSlot })).toBeFocused();
    });

    test("has no accessibility violations that axe-core finds", async ({ page }) => {
      await openNewGame(page);
      expect(await axeViolations(page)).toEqual([]);
      await page.keyboard.type("Root");
      await page.keyboard.press("Enter");
      await expect(page.getByText(language.reserved)).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  });
}

test("returns to the slot it came from with Esc", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Slot 2 New game" }).click();
  await expect(page.getByRole("textbox", { name: "Your name" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Slot 2 New game" })).toBeFocused();
});

test("returns to the slot it came from when the player clicks Back", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Slot 3 New game" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Slot 3 New game" })).toBeFocused();
});
