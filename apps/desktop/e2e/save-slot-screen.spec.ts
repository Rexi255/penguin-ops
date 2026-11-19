// End-to-end tests of the save slot screen and the way there and back (ROADMAP M3.1b, ADR 0091):
// Play opens it with the keyboard alone, it shows three empty slots in the system's language with
// the focus on the first one, Back and Esc return to the start screen, and axe-core finds no
// accessibility violations.
import { expect, test } from "./app";
import { axeViolations } from "./axe";

const LANGUAGES = [
  {
    locale: "en-US",
    play: "Play",
    title: "Choose a save slot",
    slots: ["Slot 1 New game", "Slot 2 New game", "Slot 3 New game"],
    firstSlot: "Slot 1 New game",
  },
  {
    locale: "de-DE",
    play: "Spielen",
    title: "Spielstand wählen",
    slots: ["Spielstand 1 Neues Spiel", "Spielstand 2 Neues Spiel", "Spielstand 3 Neues Spiel"],
    firstSlot: "Spielstand 1 Neues Spiel",
  },
] as const;

for (const { locale, play, title, slots, firstSlot } of LANGUAGES) {
  test.describe(`with the locale ${locale}`, () => {
    test.use({ appLocale: locale });

    test("opens the save slot screen with Enter on Play", async ({ page }) => {
      await expect(page.getByRole("button", { name: play })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("listitem")).toHaveText([...slots]);
      await expect(page.getByRole("button", { name: firstSlot, exact: true })).toBeFocused();
    });

    test("has no accessibility violations that axe-core finds", async ({ page }) => {
      await page.getByRole("button", { name: play }).click();
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  });
}

test("returns to the start screen with Esc and focuses Play", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose a save slot" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 1, name: "PenguinOps" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
});

test("returns to the start screen when the player clicks Back", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "PenguinOps" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
});
