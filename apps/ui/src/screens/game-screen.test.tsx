// @vitest-environment jsdom
// Tests of the game screen in both languages: the areas of the workplace layout as landmarks, the
// terminal that has the focus and plays the level, the ticket in the tickets panel and the top
// bar that follow the player's progress (ADR 0097), and the pause menu that Esc or the key hint
// opens and closes.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { levelSetup } from "@penguin-ops/gameplay";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { ticketTexts } from "../tickets/ticket-texts";
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
    tickets: "Tickets",
    pause: "Pause",
  },
};

function renderGameScreen(language: MandatoryLanguage = "en", levelId = "first-steps") {
  const onMainMenu = vi.fn<() => void>();
  const view = render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <GameScreen
        level={levelSetup(content, levelId, language, "max")}
        ticket={ticketTexts(content, levelId, language)}
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

const TICKETS: Readonly<
  Record<
    MandatoryLanguage,
    {
      firstSteps: string;
      welcome: string;
      backup: string;
      solved: string;
      step: (current: number) => string;
      updates: string;
      backupDone: string;
      movedConfig: string;
    }
  >
> = {
  en: {
    firstSteps: "First steps",
    welcome: "Welcome to the IT department!",
    backup: "Backup before the switch update",
    solved: "Solved",
    step: (current) => `Step ${String(current)} of 2`,
    updates: "Updates",
    backupDone: "Step doneThe backup is safe.",
    movedConfig: "TipThe configuration is now only in ~/backup",
  },
  de: {
    firstSteps: "Erste Schritte",
    welcome: "Willkommen in der IT-Abteilung!",
    backup: "Backup vor dem Switch-Update",
    solved: "Gelöst",
    step: (current) => `Schritt ${String(current)} von 2`,
    updates: "Verlauf",
    backupDone: "Schritt erledigtDas Backup ist in Sicherheit.",
    movedConfig: "TippDie Konfiguration liegt jetzt nur noch in ~/backup",
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
      const { completeHint, menuHint: menu } = EXPECTED[language];
      const footer = screen.getByRole("contentinfo");
      const hints = [...footer.querySelectorAll(".key-hint")];
      expect(hints.map((hint) => hint.textContent)).toEqual([completeHint, menu]);
      // The terminal answers Tab itself, so its hint is text, not a button.
      expect(hints[0]?.tagName).toBe("SPAN");
      expect(hints[0]?.querySelector("kbd")?.textContent).toBe("Tab");
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

  test("leaves the terminal for the ticket and then the tabs with Shift+Tab", async () => {
    renderGameScreen();
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
      expect(guideWords().textContent).toBe(expected.firstSteps);
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
    expect(guideWords().textContent).toBe(`${expected.firstSteps}${expected.solved}`);
    // Solving says nothing more than the state.
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
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
      expect(guideWords().textContent).toBe(`${expected.backup}${expected.step(1)}`);
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
      expect(guideWords().textContent).toBe(`${expected.backup}${expected.step(2)}`);
      expect(screen.getByRole("status").textContent).toBe(expected.step(2));
      expect(segments()).toEqual(["done", "current"]);
      expect(messages()).toHaveLength(2);
      expect(messages()[1]?.textContent).toContain(expected.backupDone);

      // The last step solves the ticket.
      await userEvent.keyboard("mv ~/downloads/firmware-3.0.bin ~/network/firmware/{Enter}");
      expect(guideWords().textContent).toBe(`${expected.backup}${expected.solved}`);
      expect(screen.getByRole("status").textContent).toBe(expected.solved);
      expect(segments()).toEqual(["done", "done"]);
      expect(messages()).toHaveLength(2);
    },
  );

  test("announces the ticket's state and new messages politely", async () => {
    renderGameScreen("en", "switch-backup");
    const messages = ticket().querySelector("[aria-live]");
    expect(messages?.getAttribute("aria-live")).toBe("polite");
    expect(messages?.textContent).toBe("");
    await userEvent.keyboard("mv ~/network/switch-floor2.conf ~/backup/{Enter}");
    expect(messages?.textContent).toContain("The configuration is now only in");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

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

  test("ignores other keys", async () => {
    renderGameScreen();
    commandLine().blur();
    await userEvent.keyboard("{F1}q{ArrowDown}");
    expect(pauseMenu()).toBeNull();
  });
});
