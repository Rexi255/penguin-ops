// End-to-end tests of the game screen and the pause menu (ROADMAP M3.1c, M3.4, M3.5a, M3.5b,
// M3.5c, ADR 0092, ADR 0095, ADR 0096, ADR 0097, ADR 0098, ADR 0099): a new game starts with the
// keyboard alone and the terminal has the focus, the tickets panel and the top bar show the ticket
// and that it is solved, F1 shows the hints and solving shows the explanation and the next ticket,
// the inbox opens tickets and a ticket goes on where the player left it, the side panel's
// tabs switch with the keyboard and the mouse, Esc opens and closes the pause menu, Main menu leads
// back to the start screen, and axe-core finds no accessibility violations, with the pause menu
// closed and open, with hints, with the ticket solved and with another tab chosen.
import type { Page } from "@playwright/test";

import { expect, test } from "./app";
import { axeViolations } from "./axe";

const LANGUAGES = [
  {
    locale: "en-US",
    title: "Workplace",
    sidePanel: "Side panel",
    terminal: "Terminal",
    input: "Command line",
    menuHint: "Esc Menu",
    completeHint: "Tab Complete",
    hintHint: "F1 Hint",
    hint: "Hint 1 of 3",
    explanation: "What you learned",
    tickets: "Tickets",
    chapterTitle: "First day",
    ticketTitle: "First steps",
    ticketStart: "Welcome to the IT department!",
    back: "Back to the inbox",
    inbox: "Inbox",
    nextChapter: "What others left behind",
    nextTicket: "The printer on the second floor",
    newState: "New",
    startedState: "In progress",
    solved: "Solved",
    mail: "Mail",
    mailEmpty: "No mail yet.",
    pause: "Paused",
    continue: "Continue",
    mainMenu: "Main menu",
  },
  {
    locale: "de-DE",
    title: "Arbeitsplatz",
    sidePanel: "Seitenleiste",
    terminal: "Terminal",
    input: "Befehlszeile",
    menuHint: "Esc Menü",
    completeHint: "Tab Vervollständigen",
    hintHint: "F1 Hinweis",
    hint: "Hinweis 1 von 3",
    explanation: "Was du gelernt hast",
    tickets: "Tickets",
    chapterTitle: "Der erste Tag",
    ticketTitle: "Erste Schritte",
    ticketStart: "Willkommen in der IT-Abteilung!",
    back: "Zurück zum Posteingang",
    inbox: "Posteingang",
    nextChapter: "Was andere liegen ließen",
    nextTicket: "Der Drucker im zweiten Stock",
    newState: "Neu",
    startedState: "Begonnen",
    solved: "Gelöst",
    mail: "Mails",
    mailEmpty: "Noch keine Mails.",
    pause: "Pause",
    continue: "Weiterspielen",
    mainMenu: "Hauptmenü",
  },
] as const;

/**
 * Goes from the start screen into the game with Enter on Play, Enter on the first slot, a name
 * and Enter on the new game screen. It waits for each focus, so that no key press arrives before
 * the screen that should answer it.
 */
async function startGame(page: Page): Promise<void> {
  await expect(page.locator("button:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".save-slot:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".field__input:focus")).toHaveCount(1);
  await page.keyboard.type("Max");
  await page.keyboard.press("Enter");
  await expect(page.locator(".terminal__input:focus")).toHaveCount(1);
}

for (const language of LANGUAGES) {
  test.describe(`with the locale ${language.locale}`, () => {
    test.use({ appLocale: language.locale });

    test("starts a new game in the first slot with the keyboard alone", async ({ page }) => {
      await startGame(page);
      await expect(page.getByRole("heading", { level: 1, name: language.title })).toBeAttached();
      await expect(page.getByRole("complementary", { name: language.sidePanel })).toBeVisible();
      await expect(page.getByRole("main", { name: language.terminal })).toBeVisible();
      await expect(page.getByRole("textbox", { name: language.input })).toBeFocused();
      await expect(page.getByRole("button", { name: language.menuHint })).toBeVisible();
      await expect(page.getByRole("contentinfo")).toContainText(language.completeHint);
      await expect(page.getByRole("tab", { name: language.tickets })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    test("shows the ticket and that it is solved", async ({ page }) => {
      await startGame(page);
      const ticket = page.getByRole("article", { name: language.ticketTitle });
      await expect(ticket).toBeVisible();
      await expect(ticket).toContainText(language.ticketStart);
      await expect(page.locator(".guide-words")).toHaveText(
        `${language.chapterTitle}${language.ticketTitle}`,
      );
      await page.keyboard.type("cd welcome");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status")).toHaveText(language.solved);
      await expect(page.locator(".guide-words")).toHaveText(
        `${language.chapterTitle}${language.ticketTitle}${language.solved}`,
      );
      await expect(
        page.getByRole("heading", { level: 3, name: language.explanation }),
      ).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });

    test("shows a hint with F1 and keeps the terminal's focus", async ({ page }) => {
      await startGame(page);
      await expect(page.getByRole("button", { name: language.hintHint })).toBeVisible();
      await page.keyboard.type("cd wel");
      await page.keyboard.press("F1");
      await expect(page.locator(".ticket__hint-label")).toHaveText([language.hint]);
      await expect(page.getByRole("textbox", { name: language.input })).toBeFocused();
      expect(await axeViolations(page)).toEqual([]);
      await page.keyboard.type("come");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status")).toHaveText(language.solved);
    });

    test("switches the side panel's tabs with the keyboard and goes back", async ({ page }) => {
      await startGame(page);
      // Shift+Tab goes from the terminal to the button back to the inbox, the ticket and the tabs.
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("button", { name: language.back })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("tabpanel", { name: language.tickets })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("tab", { name: language.tickets })).toBeFocused();
      await page.keyboard.press("ArrowRight");
      const mail = page.getByRole("tab", { name: language.mail });
      await expect(mail).toBeFocused();
      await expect(mail).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toHaveText(language.mailEmpty);
      expect(await axeViolations(page)).toEqual([]);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("textbox", { name: language.input })).toBeFocused();
    });

    test("goes from ticket to ticket and through the inbox with the keyboard", async ({ page }) => {
      await startGame(page);
      await page.keyboard.type("cd welcome");
      await page.keyboard.press("Enter");
      const next = page.locator(".next-ticket");
      await expect(next).toContainText(language.nextChapter);
      await expect(next.getByRole("button")).toHaveText(
        `${language.nextTicket} ${language.newState}`,
      );
      expect(await axeViolations(page)).toEqual([]);

      await next.getByRole("button").click();
      await expect(page.getByRole("article", { name: language.nextTicket })).toBeVisible();
      await expect(page.locator(".guide-words")).toHaveText(
        `${language.nextChapter}${language.nextTicket}`,
      );
      await expect(page.getByRole("textbox", { name: language.input })).toBeFocused();

      // Back to the inbox: the current ticket's row has the focus.
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { level: 2, name: language.inbox })).toBeVisible();
      const current = page.getByRole("button", {
        name: `${language.nextTicket} ${language.startedState}`,
      });
      await expect(current).toBeFocused();
      await expect(current).toHaveAttribute("aria-current", "true");
      expect(await axeViolations(page)).toEqual([]);

      // The first ticket goes on where the player left it.
      await page
        .getByRole("button", { name: `${language.ticketTitle} ${language.solved}` })
        .click();
      await expect(page.getByRole("textbox", { name: language.input })).toBeFocused();
      await expect(page.getByRole("log")).toContainText("max@itdesk:~/welcome$");
    });

    test("opens and closes the pause menu with Esc", async ({ page }) => {
      await startGame(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: language.pause })).toBeVisible();
      await expect(page.getByRole("button", { name: language.continue })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: language.input })).toBeFocused();
    });

    test("has no accessibility violations that axe-core finds", async ({ page }) => {
      await startGame(page);
      expect(await axeViolations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: language.pause })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  });
}

test("keeps the focus inside the pause menu", async ({ page }) => {
  await startGame(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Main menu" })).toBeFocused();
  // The game behind the menu is inert, so Tab wraps around to the first entry.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
});

test("opens the settings from the pause menu and returns to it", async ({ page }) => {
  await startGame(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  // A new game follows the system's language until the player chooses one.
  await expect(page.getByRole("radio", { name: "System language (English)" })).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeFocused();
});

test("restarts the game in the new language after the player confirmed it", async ({ page }) => {
  await startGame(page);
  await page.keyboard.type("cd welcome");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("banner")).toContainText("Solved");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click();
  // English keeps the game's language, so the game does not ask; German does.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
  await page.keyboard.press("ArrowDown");
  const question = page.getByRole("alertdialog", { name: "Switch the language?" });
  await expect(question.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
  await question.getByRole("button", { name: "Switch language" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Arbeitsplatz" })).toBeAttached();
  await expect(page.getByRole("banner")).toContainText("Gelöst");
  await expect(page.getByRole("textbox", { name: "Befehlszeile" })).toBeFocused();
});

test("returns to the start screen from the pause menu", async ({ page }) => {
  await startGame(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Main menu" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "PenguinOps" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
});

test("switches the side panel's tabs with the mouse", async ({ page }) => {
  await startGame(page);
  await page.getByRole("tab", { name: "Handbook" }).click();
  await expect(page.getByRole("tab", { name: "Handbook" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tabpanel")).toHaveText("The commands you learn will appear here.");
  expect(await axeViolations(page)).toEqual([]);
});

test("opens the pause menu when the player clicks the key hint", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Slot 3 New game" }).click();
  await page.getByRole("textbox", { name: "Your name" }).fill("Max");
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "Esc Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
