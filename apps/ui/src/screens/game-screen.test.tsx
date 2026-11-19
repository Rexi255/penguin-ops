// @vitest-environment jsdom
// Tests of the game screen in both languages: the areas of the workplace layout as landmarks, the
// terminal that has the focus and plays the level, and the pause menu that Esc or the key hint
// opens and closes.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { levelSetup } from "@penguin-ops/gameplay";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

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

function renderGameScreen(language: MandatoryLanguage = "en") {
  const onMainMenu = vi.fn<() => void>();
  const view = render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <GameScreen
        level={levelSetup(content, "first-steps", language, "max")}
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

  test("leaves the terminal for the side panel with Shift+Tab", async () => {
    renderGameScreen();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("tab", { name: "Tickets" })).toBe(document.activeElement);
  });

  test("keeps the terminal's focus and input when the player switches tabs", async () => {
    renderGameScreen();
    await userEvent.keyboard("pw");
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

  test("ignores other keys", async () => {
    renderGameScreen();
    commandLine().blur();
    await userEvent.keyboard("{F1}q{ArrowDown}");
    expect(pauseMenu()).toBeNull();
  });
});
