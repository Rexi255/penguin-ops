// End-to-end tests of the game screen and the pause menu (ROADMAP M3.1c, ADR 0092): an empty slot
// starts the game with the keyboard alone, Esc opens and closes the pause menu, Main menu leads
// back to the start screen, and axe-core finds no accessibility violations, with the pause menu
// closed and open.
import type { Page } from "@playwright/test";

import { expect, test } from "./app";
import { axeViolations } from "./axe";

const LANGUAGES = [
  {
    locale: "en-US",
    title: "Workplace",
    sidePanel: "Side panel",
    terminal: "Terminal",
    menuHint: "Esc Menu",
    pause: "Paused",
    continue: "Continue",
    mainMenu: "Main menu",
  },
  {
    locale: "de-DE",
    title: "Arbeitsplatz",
    sidePanel: "Seitenleiste",
    terminal: "Terminal",
    menuHint: "Esc Menü",
    pause: "Pause",
    continue: "Weiterspielen",
    mainMenu: "Hauptmenü",
  },
] as const;

/**
 * Goes from the start screen into the game with Enter on Play and Enter on the first slot. It
 * waits for each focus, so that no key press arrives before the screen that should answer it.
 */
async function startGame(page: Page): Promise<void> {
  await expect(page.locator("button:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".save-slot:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".key-hint:focus")).toHaveCount(1);
}

for (const language of LANGUAGES) {
  test.describe(`with the locale ${language.locale}`, () => {
    test.use({ appLocale: language.locale });

    test("starts the game in the first slot with the keyboard alone", async ({ page }) => {
      await startGame(page);
      await expect(page.getByRole("heading", { level: 1, name: language.title })).toBeAttached();
      await expect(page.getByRole("complementary", { name: language.sidePanel })).toBeVisible();
      await expect(page.getByRole("main", { name: language.terminal })).toBeVisible();
      await expect(page.getByRole("button", { name: language.menuHint })).toBeFocused();
    });

    test("opens and closes the pause menu with Esc", async ({ page }) => {
      await startGame(page);
      await expect(page.getByRole("button", { name: language.menuHint })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: language.pause })).toBeVisible();
      await expect(page.getByRole("button", { name: language.continue })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("button", { name: language.menuHint })).toBeFocused();
    });

    test("has no accessibility violations that axe-core finds", async ({ page }) => {
      await startGame(page);
      await expect(page.getByRole("button", { name: language.menuHint })).toBeFocused();
      expect(await axeViolations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: language.pause })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  });
}

test("keeps the focus inside the pause menu", async ({ page }) => {
  await startGame(page);
  await expect(page.getByRole("button", { name: "Esc Menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Main menu" })).toBeFocused();
  // The game behind the menu is inert, so Tab wraps around to the first entry.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
});

test("returns to the start screen from the pause menu", async ({ page }) => {
  await startGame(page);
  await expect(page.getByRole("button", { name: "Esc Menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Main menu" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "PenguinOps" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
});

test("opens the pause menu when the player clicks the key hint", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Slot 3 New game" }).click();
  await page.getByRole("button", { name: "Esc Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
