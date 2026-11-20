// @vitest-environment jsdom
// Tests of the game screen in both languages: the areas of the workplace layout as landmarks, the
// terminal that has the focus and plays the level, the ticket in the tickets panel and the top
// bar that follow the player's progress (ADR 0097), the hints that F1 or its key hint shows and the
// explanation after solving (ADR 0098), and the pause menu that Esc or the key hint opens and
// closes.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import type { GameMode } from "@penguin-ops/gameplay";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { GameScreen } from "./game-screen";

const content = loadBundledContent();
const { uiCatalogs } = content;

const EXPECTED: Readonly<
  Record<
    MandatoryLanguage,
    {
      title: string;
      sidePanel: string;
      terminal: string;
      input: string;
      menuHint: string;
      completeHint: string;
      hintHint: string;
      tickets: string;
      pause: string;
    }
  >
> = {
  en: {
    title: "Workplace",
    sidePanel: "Side panel",
    terminal: "Terminal",
    input: "Command line",
    menuHint: "Esc Menu",
    completeHint: "Tab Complete",
    hintHint: "F1 Hint",
    tickets: "Tickets",
    pause: "Paused",
  },
  de: {
    title: "Arbeitsplatz",
    sidePanel: "Seitenleiste",
    terminal: "Terminal",
    input: "Befehlszeile",
    menuHint: "Esc Menü",
    completeHint: "Tab Vervollständigen",
    hintHint: "F1 Hinweis",
    tickets: "Tickets",
    pause: "Pause",
  },
};

/**
 * The game screen of a new game that starts with `firstTicket`. A first ticket outside the first
 * chapter is only open in Sandbox mode.
 */
function renderGameScreen(
  language: MandatoryLanguage = "en",
  firstTicket = "first-steps",
  mode: GameMode = firstTicket === "first-steps" ? "story" : "sandbox",
) {
  const onMainMenu = vi.fn<() => void>();
  const view = render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <GameScreen
        content={content}
        mode={mode}
        userName="max"
        firstTicket={firstTicket}
        onMainMenu={onMainMenu}
      />
    </TextsProvider>,
  );
  return { onMainMenu, view };
}

function pauseMenu() {
  return screen.queryByRole("dialog", { name: "Paused" });
}

function menuHint() {
  return screen.getByRole("button", { name: "Esc Menu" });
}

function commandLine() {
  return screen.getByRole("textbox", { name: "Command line" });
}

/** The element that holds the four areas and turns inert while the pause menu is open. */
function frame() {
  const frameElement = screen.getByRole("banner", { hidden: true }).parentElement;
  if (frameElement === null) {
    throw new Error("The top bar has no parent.");
  }
  return frameElement;
}

/** The ticket's title, step and state in the top bar. */
function guideWords() {
  const words = screen.getByRole("banner").querySelector(".guide-words");
  if (words === null) {
    throw new Error("The top bar has no guide words.");
  }
  return words;
}

/** The ticket in the tickets panel. */
function ticket() {
  return screen.getByRole("article");
}

/** The labels of the hints the ticket panel shows, such as "Hint 1 of 3". */
function hintLabels() {
  return [...document.querySelectorAll(".ticket__hint-label")].map((label) => label.textContent);
}

const TICKETS: Readonly<
  Record<
    MandatoryLanguage,
    {
      firstDay: string;
      tidyingUp: string;
      firstSteps: string;
      welcome: string;
      backup: string;
      solved: string;
      step: (current: number) => string;
      updates: string;
      backupDone: string;
      movedConfig: string;
      hint: (number: number) => string;
      explanation: string;
      next: string;
    }
  >
> = {
  en: {
    firstDay: "First day",
    tidyingUp: "Tidying up",
    firstSteps: "First steps",
    welcome: "Welcome to the IT department!",
    backup: "Backup before the switch update",
    solved: "Solved",
    step: (current) => `Step ${String(current)} of 2`,
    updates: "Updates",
    backupDone: "Step doneThe backup is safe.",
    movedConfig: "TipThe configuration is now only in ~/backup",
    hint: (number) => `Hint ${String(number)} of 3`,
    explanation: "What you learned",
    next: "Next ticket",
  },
  de: {
    firstDay: "Der erste Tag",
    tidyingUp: "Aufräumen",
    firstSteps: "Erste Schritte",
    welcome: "Willkommen in der IT-Abteilung!",
    backup: "Backup vor dem Switch-Update",
    solved: "Gelöst",
    step: (current) => `Schritt ${String(current)} von 2`,
    updates: "Verlauf",
    backupDone: "Schritt erledigtDas Backup ist in Sicherheit.",
    movedConfig: "TippDie Konfiguration liegt jetzt nur noch in ~/backup",
    hint: (number) => `Hinweis ${String(number)} von 3`,
    explanation: "Was du gelernt hast",
    next: "Nächstes Ticket",
  },
};

/** jsdom lays nothing out, so it has no scrollIntoView; the ticket panel scrolls new messages. */
const scrollIntoView = vi.fn<Element["scrollIntoView"]>();

beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
});

describe("GameScreen", () => {
  test.each(MANDATORY_LANGUAGES)("shows the four areas as landmarks in %s", (language) => {
    renderGameScreen(language);
    const { title, sidePanel, terminal } = EXPECTED[language];
    expect(screen.getByRole("banner")).toBeDefined();
    expect(screen.getByRole("complementary", { name: sidePanel })).toBeDefined();
    expect(screen.getByRole("main", { name: terminal })).toBeDefined();
    expect(screen.getByRole("contentinfo")).toBeDefined();
    // The heading names the screen for screen readers; the areas show where the player is.
    const heading = screen.getByRole("heading", { level: 1, name: title });
    expect(heading.className).toBe("visually-hidden");
  });

  test.each(MANDATORY_LANGUAGES)("gives the terminal's input line the focus in %s", (language) => {
    renderGameScreen(language);
    const input = screen.getByRole("textbox", { name: EXPECTED[language].input });
    expect(input).toBe(document.activeElement);
    const hint = screen.getByRole("button", { name: EXPECTED[language].menuHint });
    expect(hint.getAttribute("aria-keyshortcuts")).toBe("Escape");
    expect(hint.querySelector("kbd")?.textContent).toBe("Esc");
  });

  test.each(MANDATORY_LANGUAGES)(
    "shows the key hints of the keys that work in the footer in %s",
    (language) => {
      renderGameScreen(language);
      const { completeHint, menuHint: menu, hintHint } = EXPECTED[language];
      const footer = screen.getByRole("contentinfo");
      const hints = [...footer.querySelectorAll(".key-hint")];
      expect(hints.map((hint) => hint.textContent)).toEqual([hintHint, completeHint, menu]);
      const hint = screen.getByRole("button", { name: hintHint });
      expect(hint.getAttribute("aria-keyshortcuts")).toBe("F1");
      expect(hint.querySelector("kbd")?.textContent).toBe("F1");
      // The terminal answers Tab itself, so its hint is text, not a button.
      expect(hints[1]?.tagName).toBe("SPAN");
      expect(hints[1]?.querySelector("kbd")?.textContent).toBe("Tab");
      expect(screen.queryByRole("button", { name: completeHint })).toBeNull();
    },
  );

  test.each(MANDATORY_LANGUAGES)("shows the side panel's tabs in %s", (language) => {
    renderGameScreen(language);
    const { sidePanel, tickets } = EXPECTED[language];
    const panel = screen.getByRole("complementary", { name: sidePanel });
    const tab = screen.getByRole("tab", { name: tickets, selected: true });
    expect(panel.contains(tab)).toBe(true);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  test("leaves the terminal for the inbox button, the ticket and the tabs with Shift+Tab", async () => {
    renderGameScreen();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Back to the inbox" })).toBe(document.activeElement);
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("tabpanel", { name: "Tickets" })).toBe(document.activeElement);
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("tab", { name: "Tickets" })).toBe(document.activeElement);
  });

  test("keeps the terminal's focus and input when the player switches tabs", async () => {
    renderGameScreen();
    await userEvent.keyboard("pw");
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Mail", selected: true })).toBe(document.activeElement);
    await userEvent.tab();
    await userEvent.tab();
    expect(commandLine()).toBe(document.activeElement);
    await userEvent.keyboard("d{Enter}");
    expect(screen.getByRole("log").textContent).toContain("max@itdesk:~$ pwd");
  });

  test("opens the pause menu with Esc from a tab and gives the focus back to it", async () => {
    renderGameScreen();
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.keyboard("{Escape}");
    expect(pauseMenu()).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("tab", { name: "Tickets" })).toBe(document.activeElement);
  });

  test("plays the level in the terminal as the player", async () => {
    renderGameScreen();
    const terminal = screen.getByRole("log", { name: "Terminal output" });
    expect(terminal.textContent).toContain("max@itdesk:~$");
    await userEvent.keyboard("cd welcome{Enter}");
    expect(terminal.textContent).toContain("max@itdesk:~/welcome$");
  });

  test("opens the pause menu with Esc from the terminal and keeps the input line", async () => {
    renderGameScreen();
    await userEvent.keyboard("ls");
    await userEvent.keyboard("{Escape}");
    expect(pauseMenu()).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(commandLine()).toBe(document.activeElement);
    await userEvent.keyboard(" -a{Enter}");
    expect(screen.getByRole("log").textContent).toContain("max@itdesk:~$ ls -a");
  });

  test("starts without the pause menu", () => {
    renderGameScreen();
    expect(pauseMenu()).toBeNull();
    expect(frame().hasAttribute("inert")).toBe(false);
  });

  test.each(MANDATORY_LANGUAGES)("opens the pause menu with Esc in %s", async (language) => {
    renderGameScreen(language);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: EXPECTED[language].pause })).toBeDefined();
  });

  test("makes the game inert and focuses Continue while the pause menu is open", async () => {
    renderGameScreen();
    await userEvent.keyboard("{Escape}");
    expect(frame().hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("button", { name: "Continue" })).toBe(document.activeElement);
  });

  test("opens the pause menu when the player clicks the key hint", async () => {
    renderGameScreen();
    await userEvent.click(menuHint());
    expect(pauseMenu()).not.toBeNull();
  });

  test("opens the pause menu with Enter on the focused key hint", async () => {
    renderGameScreen();
    menuHint().focus();
    await userEvent.keyboard("{Enter}");
    expect(pauseMenu()).not.toBeNull();
  });

  test("opens the pause menu with Esc wherever the focus is", async () => {
    renderGameScreen();
    commandLine().blur();
    await userEvent.keyboard("{Escape}");
    expect(pauseMenu()).not.toBeNull();
  });

  test("keeps the pause menu open while Esc is held down", async () => {
    renderGameScreen();
    await userEvent.keyboard("{Escape>3/}");
    expect(pauseMenu()).not.toBeNull();
  });

  test("closes the pause menu with a second Esc and gives the focus back", async () => {
    renderGameScreen();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    expect(pauseMenu()).toBeNull();
    expect(frame().hasAttribute("inert")).toBe(false);
    expect(commandLine()).toBe(document.activeElement);
  });

  test("closes the pause menu with Continue and gives the focus back", async () => {
    renderGameScreen();
    await userEvent.click(menuHint());
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(pauseMenu()).toBeNull();
    expect(menuHint()).toBe(document.activeElement);
  });

  test("gives the focus to the terminal when it was on no control before the pause", async () => {
    renderGameScreen();
    commandLine().blur();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    expect(commandLine()).toBe(document.activeElement);
  });

  test("opens and closes the pause menu again and again", async () => {
    renderGameScreen();
    for (let round = 0; round < 3; round += 1) {
      await userEvent.keyboard("{Escape}");
      expect(pauseMenu()).not.toBeNull();
      await userEvent.keyboard("{Escape}");
      expect(pauseMenu()).toBeNull();
    }
  });

  test("leaves for the main menu from the pause menu", async () => {
    const { onMainMenu } = renderGameScreen();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Main menu" }));
    expect(onMainMenu).toHaveBeenCalledExactlyOnceWith();
  });

  test("never leaves the game with Esc alone", async () => {
    const { onMainMenu } = renderGameScreen();
    await userEvent.keyboard("{Escape}{Escape}{Escape}");
    expect(onMainMenu).not.toHaveBeenCalled();
    expect(pauseMenu()).not.toBeNull();
  });

  test.each(MANDATORY_LANGUAGES)(
    "shows the ticket in the tickets panel and its title in the top bar in %s",
    (language) => {
      renderGameScreen(language);
      const expected = TICKETS[language];
      const panel = screen.getByRole("tabpanel", { name: EXPECTED[language].tickets });
      expect(panel.contains(ticket())).toBe(true);
      expect(screen.getByRole("heading", { level: 2, name: expected.firstSteps })).toBeDefined();
      expect(ticket().textContent).toContain(expected.welcome);
      // A ticket with a single goal has no step to show until it is solved.
      expect(guideWords().textContent).toBe(`${expected.firstDay}${expected.firstSteps}`);
      expect(screen.getByRole("status").textContent).toBe("");
    },
  );

  test.each(MANDATORY_LANGUAGES)("shows the solved ticket in %s", async (language) => {
    renderGameScreen(language);
    const expected = TICKETS[language];
    await userEvent.keyboard("ls{Enter}");
    expect(screen.getByRole("status").textContent).toBe("");
    await userEvent.keyboard("cd welcome{Enter}");
    expect(screen.getByRole("status").textContent).toBe(expected.solved);
    expect(guideWords().textContent).toBe(
      `${expected.firstDay}${expected.firstSteps}${expected.solved}`,
    );
    // Solving shows the explanation and no message.
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([expected.explanation, expected.next]);
    expect(ticket().querySelector(".ticket__example code")?.textContent).toBe("cd ~/welcome");
  });

  test.each(MANDATORY_LANGUAGES)(
    "follows the steps, the step messages and the tips of a ticket in %s",
    async (language) => {
      const { view } = renderGameScreen(language, "switch-backup");
      const expected = TICKETS[language];
      const segments = () =>
        [...view.container.querySelectorAll(".ticket__segment")].map((segment) =>
          segment.className.replace("ticket__segment ticket__segment--", ""),
        );
      expect(guideWords().textContent).toBe(
        `${expected.tidyingUp}${expected.backup}${expected.step(1)}`,
      );
      expect(screen.getByRole("status").textContent).toBe(expected.step(1));
      expect(segments()).toEqual(["current", "open"]);

      // A typical mistake gives a tip.
      await userEvent.keyboard("mv ~/network/switch-floor2.conf ~/backup/{Enter}");
      expect(screen.getByRole("heading", { level: 3, name: expected.updates })).toBeDefined();
      const messages = () =>
        screen
          .getAllByRole("listitem")
          .filter((item) => item.closest(".ticket__messages") !== null);
      expect(messages()).toHaveLength(1);
      expect(messages()[0]?.textContent).toContain(expected.movedConfig);

      // The first step completes with its message, after the tip.
      await userEvent.keyboard("mv ~/backup/switch-floor2.conf ~/network/{Enter}");
      await userEvent.keyboard("cp ~/network/switch-floor2.conf ~/backup/{Enter}");
      expect(guideWords().textContent).toBe(
        `${expected.tidyingUp}${expected.backup}${expected.step(2)}`,
      );
      expect(screen.getByRole("status").textContent).toBe(expected.step(2));
      expect(segments()).toEqual(["done", "current"]);
      expect(messages()).toHaveLength(2);
      expect(messages()[1]?.textContent).toContain(expected.backupDone);

      // The last step solves the ticket.
      await userEvent.keyboard("mv ~/downloads/firmware-3.0.bin ~/network/firmware/{Enter}");
      expect(guideWords().textContent).toBe(
        `${expected.tidyingUp}${expected.backup}${expected.solved}`,
      );
      expect(screen.getByRole("status").textContent).toBe(expected.solved);
      expect(segments()).toEqual(["done", "done"]);
      expect(messages()).toHaveLength(2);
    },
  );

  test("announces the ticket's state, new hints and new messages politely", async () => {
    renderGameScreen("en", "switch-backup");
    const [hints, messages] = ticket().querySelectorAll("[aria-live]");
    expect(hints?.getAttribute("aria-live")).toBe("polite");
    expect(messages?.getAttribute("aria-live")).toBe("polite");
    expect(messages?.textContent).toBe("");
    await userEvent.keyboard("mv ~/network/switch-floor2.conf ~/backup/{Enter}");
    expect(messages?.textContent).toContain("The configuration is now only in");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(hints?.textContent).toBe("");
    await userEvent.keyboard("{F1}");
    expect(hints?.textContent).toContain("Hint 1 of 3");
  });

  test.each(MANDATORY_LANGUAGES)(
    "marks an extra goal reached and announces it, also after solving, in %s",
    async (language) => {
      const { view } = renderGameScreen(language, "project-folders");
      const reached = language === "en" ? "Reached" : "Erreicht";
      const done = language === "en" ? "Extra goal reached" : "Extraziel erreicht";
      const goalState = () => view.container.querySelector(".ticket__goal-state")?.textContent;
      const [, messages] = ticket().querySelectorAll("[aria-live]");
      expect(goalState()).toBe(language === "en" ? "Open" : "Offen");
      await solve("project-folders");
      expect(screen.getByRole("status").textContent).toBe(TICKETS[language].solved);
      expect(goalState()).toBe(language === "en" ? "Open" : "Offen");
      await userEvent.keyboard("touch ~/projects/relaunch/README.txt{Enter}");
      expect(goalState()).toBe(reached);
      expect(messages?.querySelector(".ticket__message--extra-goal")?.textContent).toContain(
        `${done}+20 XP`,
      );
      // The extra goal is reached once: doing it again adds no message.
      await userEvent.keyboard("touch ~/projects/relaunch/README.txt{Enter}");
      expect(messages?.querySelectorAll(".ticket__message--extra-goal")).toHaveLength(1);
    },
  );

  test("keeps the ticket's progress while inputs change nothing in the game", async () => {
    renderGameScreen("en", "switch-backup");
    await userEvent.keyboard("cp ~/network/switch-floor2.conf ~/backup/{Enter}");
    await userEvent.keyboard("pwd{Enter}ls{Enter}{ArrowUp}{ArrowUp}");
    await userEvent.keyboard("{Control>}c{/Control}{Control>}l{/Control}");
    expect(screen.getByRole("status").textContent).toBe("Step 2 of 2");
    expect(
      screen.getAllByRole("listitem").filter((item) => item.closest(".ticket__messages") !== null),
    ).toHaveLength(1);
  });

  test.each(MANDATORY_LANGUAGES)(
    "shows the next hint with F1 from the terminal and keeps typing there in %s",
    async (language) => {
      renderGameScreen(language);
      const expected = TICKETS[language];
      await userEvent.keyboard("cd wel");
      await userEvent.keyboard("{F1}");
      expect(hintLabels()).toEqual([expected.hint(1)]);
      expect(screen.getByRole("textbox", { name: EXPECTED[language].input })).toBe(
        document.activeElement,
      );
      await userEvent.keyboard("come{Enter}");
      expect(screen.getByRole("log").textContent).toContain("max@itdesk:~$ cd welcome");
      expect(screen.getByRole("status").textContent).toBe(expected.solved);
    },
  );

  test("shows one more hint with every F1, up to the solution", async () => {
    renderGameScreen();
    await userEvent.keyboard("{F1}{F1}");
    expect(hintLabels()).toEqual(["Hint 1 of 3", "Hint 2 of 3"]);
    await userEvent.keyboard("{F1}");
    expect(hintLabels()).toEqual(["Hint 1 of 3", "Hint 2 of 3", "Hint 3 of 3"]);
    expect(ticket().textContent).toContain("Type cd welcome.");
    // There are no more hints; F1 changes nothing.
    await userEvent.keyboard("{F1}");
    expect(hintLabels()).toHaveLength(3);
  });

  test("shows the hint of the game command hint in the terminal and the ticket", async () => {
    renderGameScreen();
    await userEvent.click(screen.getByRole("tab", { name: "Mail" }));
    await userEvent.click(screen.getByRole("textbox", { name: "Command line" }));
    await userEvent.keyboard("hint{Enter}");
    expect(screen.getByRole("tab", { name: "Tickets", selected: true })).toBeDefined();
    expect(hintLabels()).toEqual(["Hint 1 of 3"]);
    expect(document.querySelector(".terminal__game-label")?.textContent).toBe("Hint 1 of 3");
    expect(screen.getByRole("textbox", { name: "Command line" })).toBe(document.activeElement);
  });

  test("counts the hints of F1 and of the game command hint together", async () => {
    renderGameScreen("de");
    await userEvent.keyboard("{F1}hint{Enter}");
    expect(hintLabels()).toEqual(["Hinweis 1 von 3", "Hinweis 2 von 3"]);
    expect(
      [...document.querySelectorAll(".terminal__game-label")].map((label) => label.textContent),
    ).toEqual(["Hinweis 2 von 3"]);
    await userEvent.keyboard("hint{Enter}{F1}hint{Enter}");
    expect(hintLabels()).toHaveLength(3);
    expect(screen.getByRole("log").textContent).toContain(
      "Du hast alle drei Hinweise zu diesem Ticket gesehen.",
    );
  });

  test("shows only one hint while F1 is held down", async () => {
    renderGameScreen();
    await userEvent.keyboard("{F1>3/}");
    expect(hintLabels()).toEqual(["Hint 1 of 3"]);
  });

  test("shows the next hint when the player clicks the key hint", async () => {
    renderGameScreen();
    await userEvent.click(screen.getByRole("button", { name: "F1 Hint" }));
    expect(hintLabels()).toEqual(["Hint 1 of 3"]);
    await userEvent.keyboard("{Enter}");
    expect(hintLabels()).toEqual(["Hint 1 of 3", "Hint 2 of 3"]);
  });

  test("brings the tickets panel to the front with F1 and keeps the focus", async () => {
    renderGameScreen();
    await userEvent.click(screen.getByRole("tab", { name: "Mail" }));
    await userEvent.keyboard("{F1}");
    expect(screen.getByRole("tab", { name: "Tickets", selected: true })).toBeDefined();
    expect(screen.getByRole("tabpanel", { name: "Tickets" }).contains(ticket())).toBe(true);
    expect(hintLabels()).toEqual(["Hint 1 of 3"]);
    expect(screen.getByRole("tab", { name: "Mail" })).toBe(document.activeElement);
  });

  test("still shows hints after the ticket is solved", async () => {
    renderGameScreen();
    await userEvent.keyboard("cd welcome{Enter}{F1}");
    expect(hintLabels()).toEqual(["Hint 1 of 3"]);
    expect(screen.getByRole("heading", { level: 3, name: "What you learned" })).toBeDefined();
  });

  test("shows no hint with F1 while the pause menu is open", async () => {
    renderGameScreen();
    await userEvent.keyboard("{Escape}{F1}");
    await userEvent.keyboard("{Escape}");
    expect(hintLabels()).toEqual([]);
  });

  test("keeps the hints while the player plays on", async () => {
    renderGameScreen("en", "switch-backup");
    await userEvent.keyboard("{F1}cp ~/network/switch-floor2.conf ~/backup/{Enter}{F1}");
    expect(hintLabels()).toEqual(["Hint 1 of 3", "Hint 2 of 3"]);
    expect(screen.getByRole("status").textContent).toBe("Step 2 of 2");
  });

  test("ignores other keys", async () => {
    renderGameScreen();
    commandLine().blur();
    await userEvent.keyboard("{F2}{F3}q{ArrowDown}");
    expect(pauseMenu()).toBeNull();
  });
});

const INBOX: Readonly<
  Record<
    MandatoryLanguage,
    {
      inbox: string;
      back: string;
      chapters: readonly [string, string, string];
      printer: string;
      chapterOpen: string;
      allSolved: string;
      progress: (solved: number, count: number) => string;
      states: { new: string; started: string; solved: string };
    }
  >
> = {
  en: {
    inbox: "Inbox",
    back: "Back to the inbox",
    chapters: ["First day", "What others left behind", "Tidying up"],
    printer: "The printer on the second floor",
    chapterOpen: "A new chapter is open: What others left behind",
    allSolved: "Every ticket in your inbox is solved.",
    progress: (solved, count) => `${String(solved)} of ${String(count)} solved`,
    states: { new: "New", started: "In progress", solved: "Solved" },
  },
  de: {
    inbox: "Posteingang",
    back: "Zurück zum Posteingang",
    chapters: ["Der erste Tag", "Was andere liegen ließen", "Aufräumen"],
    printer: "Der Drucker im zweiten Stock",
    chapterOpen: "Ein neues Kapitel ist offen: Was andere liegen ließen",
    allSolved: "Alle Tickets in deinem Posteingang sind gelöst.",
    progress: (solved, count) => `${String(solved)} von ${String(count)} gelöst`,
    states: { new: "Neu", started: "Begonnen", solved: "Gelöst" },
  },
};

/** The rows of the inbox as their title and state, chapter by chapter. */
function inboxRows() {
  return [...document.querySelectorAll(".inbox__chapter")].map((chapter) => ({
    chapter: chapter.querySelector("h3")?.textContent,
    progress: chapter.querySelector(".inbox__progress")?.textContent,
    tickets: [...chapter.querySelectorAll(".inbox-ticket")].map((row) => ({
      title: row.querySelector(".inbox-ticket__title")?.textContent,
      state: row.querySelector(".inbox-ticket__state")?.textContent,
      current: row.getAttribute("aria-current") === "true",
    })),
  }));
}

/** Types the first reference solution of the level `levelId` into the terminal. */
async function solve(levelId: string) {
  const solution = content.levels.get(levelId)?.solutions[0];
  if (solution === undefined) {
    throw new Error(`The level "${levelId}" has no solution.`);
  }
  for (const input of solution) {
    await userEvent.keyboard(`${input.replaceAll("{", "{{").replaceAll("[", "[[")}{Enter}`);
  }
}

/** The section that offers the next ticket after solving. */
function nextTicketSection() {
  const section = document.querySelector(".next-ticket");
  if (!(section instanceof HTMLElement)) {
    throw new Error("There is no next ticket section.");
  }
  return section;
}

describe("GameScreen: the chapter inbox", () => {
  test.each(MANDATORY_LANGUAGES)(
    "shows only the first chapter of a new story game in %s",
    async (language) => {
      renderGameScreen(language);
      const expected = INBOX[language];
      await userEvent.click(screen.getByRole("button", { name: expected.back }));
      expect(screen.getByRole("heading", { level: 2, name: expected.inbox })).toBeDefined();
      expect(inboxRows()).toEqual([
        {
          chapter: expected.chapters[0],
          progress: expected.progress(0, 1),
          tickets: [
            { title: TICKETS[language].firstSteps, state: expected.states.started, current: true },
          ],
        },
      ]);
    },
  );

  test.each(MANDATORY_LANGUAGES)(
    "shows every chapter of a new sandbox game in %s",
    async (language) => {
      renderGameScreen(language, "first-steps", "sandbox");
      const expected = INBOX[language];
      await userEvent.click(screen.getByRole("button", { name: expected.back }));
      const rows = inboxRows();
      expect(rows.map((row) => row.chapter)).toEqual(expected.chapters);
      expect(rows.map((row) => row.progress)).toEqual([
        expected.progress(0, 1),
        expected.progress(0, 1),
        expected.progress(0, 3),
      ]);
      expect(rows[2]?.tickets.map((row) => row.state)).toEqual([
        expected.states.new,
        expected.states.new,
        expected.states.new,
      ]);
    },
  );

  test("gives the current ticket's row the focus when the inbox appears", async () => {
    renderGameScreen("en", "switch-backup");
    await userEvent.click(screen.getByRole("button", { name: "Back to the inbox" }));
    const current = screen.getByRole("button", {
      name: "Backup before the switch update In progress",
    });
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(current).toBe(document.activeElement);
    expect(screen.queryByRole("article")).toBeNull();
  });

  test.each(MANDATORY_LANGUAGES)(
    "offers the next ticket after solving, with the chapter it opened, in %s",
    async (language) => {
      renderGameScreen(language);
      const expected = INBOX[language];
      await userEvent.keyboard("cd welcome{Enter}");
      const section = nextTicketSection();
      expect(section.querySelector(".next-ticket__text")?.textContent).toBe(expected.chapterOpen);
      const row = within(section).getByRole("button");
      expect(row.textContent).toBe(`${expected.printer} ${expected.states.new}`);
      expect(row.hasAttribute("aria-current")).toBe(false);

      await userEvent.click(row);
      expect(screen.getByRole("heading", { level: 2, name: expected.printer })).toBeDefined();
      expect(guideWords().textContent).toBe(`${expected.chapters[1]}${expected.printer}`);
      // The new ticket has a terminal of its own, which has the focus.
      expect(screen.getByRole("textbox", { name: EXPECTED[language].input })).toBe(
        document.activeElement,
      );
      expect(screen.getByRole("log").textContent).not.toContain("cd welcome");
      expect(document.querySelector(".next-ticket")).toBeNull();
    },
  );

  test("offers no chapter when the next ticket was open before", async () => {
    renderGameScreen("en", "project-folders");
    await solve("project-folders");
    const section = nextTicketSection();
    expect(section.querySelector(".next-ticket__text")).toBeNull();
    expect(within(section).getByRole("button").textContent).toBe(
      "Backup before the switch update New",
    );
  });

  test("goes on in a ticket the player left, where they left it", async () => {
    renderGameScreen("en", "switch-backup");
    await userEvent.keyboard("cp ~/network/switch-floor2.conf ~/backup/{Enter}{F1}cd net");
    await userEvent.click(screen.getByRole("button", { name: "Back to the inbox" }));
    await userEvent.click(screen.getByRole("button", { name: "Disk full! New" }));
    expect(screen.getByRole("heading", { level: 2, name: "Disk full!" })).toBeDefined();
    await userEvent.keyboard("ls{Enter}");

    await userEvent.click(screen.getByRole("button", { name: "Back to the inbox" }));
    expect(inboxRows()[2]?.tickets.map((row) => row.state)).toEqual([
      "New",
      "In progress",
      "In progress",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Backup before the switch update In progress" }),
    );
    expect(commandLine()).toBe(document.activeElement);
    const log = screen.getByRole("log");
    expect(log.textContent).toContain("max@itdesk:~$ cp ~/network/switch-floor2.conf ~/backup/");
    expect(log.textContent).not.toContain("$ ls");
    expect(screen.getByRole("status").textContent).toBe("Step 2 of 2");
    expect(hintLabels()).toEqual(["Hint 1 of 3"]);
    // The input line is where the player left it.
    await userEvent.keyboard("work/firmware{Enter}");
    expect(log.textContent).toContain("max@itdesk:~$ cd network/firmware");
  });

  test("opens the current ticket again from the inbox without starting it again", async () => {
    renderGameScreen();
    await userEvent.keyboard("ls{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Back to the inbox" }));
    await userEvent.click(screen.getByRole("button", { name: "First steps In progress" }));
    expect(screen.getByRole("log").textContent).toContain("max@itdesk:~$ ls");
    expect(commandLine()).toBe(document.activeElement);
  });

  test("marks solved tickets and counts them in the inbox", async () => {
    renderGameScreen("en", "project-folders");
    await solve("project-folders");
    await userEvent.click(screen.getByRole("button", { name: "Back to the inbox" }));
    const tidyingUp = inboxRows()[2];
    expect(tidyingUp?.progress).toBe("1 of 3 solved");
    expect(tidyingUp?.tickets[0]).toEqual({
      title: "New project folders",
      state: "Solved",
      current: true,
    });
  });

  test("brings the ticket back from the inbox with F1", async () => {
    renderGameScreen();
    await userEvent.click(screen.getByRole("button", { name: "Back to the inbox" }));
    await userEvent.keyboard("{F1}");
    expect(screen.getByRole("article")).toBeDefined();
    expect(hintLabels()).toEqual(["Hint 1 of 3"]);
  });

  test.each(MANDATORY_LANGUAGES)(
    "plays every ticket of the story one after another in %s",
    async (language) => {
      renderGameScreen(language);
      const order = content.chapters.flatMap((chapter) => chapter.levels);
      for (const [index, levelId] of order.entries()) {
        await solve(levelId);
        expect(screen.getByRole("status").textContent).toBe(TICKETS[language].solved);
        if (index < order.length - 1) {
          await userEvent.click(within(nextTicketSection()).getByRole("button"));
        }
      }
      expect(nextTicketSection().textContent).toBe(
        `${TICKETS[language].next}${INBOX[language].allSolved}`,
      );
      await userEvent.click(screen.getByRole("button", { name: INBOX[language].back }));
      expect(inboxRows().flatMap((row) => row.tickets.map((ticket) => ticket.state))).toEqual(
        order.map(() => INBOX[language].states.solved),
      );
    },
  );

  test("throws for a first ticket in a closed chapter", () => {
    // React reports the error of the render; the test only needs it thrown.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderGameScreen("en", "disk-full", "story")).toThrow(
      'The level "disk-full" is not open in a new story game.',
    );
  });
});
