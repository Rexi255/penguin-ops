// @vitest-environment jsdom
// Tests of the game screen in both languages: the areas of the workplace layout as landmarks, the
// key hint that has the focus, and the pause menu that Esc or the key hint opens and closes.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { GameScreen } from "./game-screen";

const { uiCatalogs } = loadBundledContent();

const EXPECTED: Readonly<
  Record<
    MandatoryLanguage,
    { title: string; sidePanel: string; terminal: string; menuHint: string; pause: string }
  >
> = {
  en: {
    title: "Workplace",
    sidePanel: "Side panel",
    terminal: "Terminal",
    menuHint: "Esc Menu",
    pause: "Paused",
  },
  de: {
    title: "Arbeitsplatz",
    sidePanel: "Seitenleiste",
    terminal: "Terminal",
    menuHint: "Esc Menü",
    pause: "Pause",
  },
};

function renderGameScreen(language: MandatoryLanguage = "en") {
  const onMainMenu = vi.fn<() => void>();
  const view = render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <GameScreen onMainMenu={onMainMenu} />
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

  test.each(MANDATORY_LANGUAGES)("gives the menu key hint the focus in %s", (language) => {
    renderGameScreen(language);
    const hint = screen.getByRole("button", { name: EXPECTED[language].menuHint });
    expect(hint).toBe(document.activeElement);
    expect(hint.getAttribute("aria-keyshortcuts")).toBe("Escape");
    expect(hint.querySelector("kbd")?.textContent).toBe("Esc");
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
    await userEvent.keyboard("{Enter}");
    expect(pauseMenu()).not.toBeNull();
  });

  test("opens the pause menu with Esc wherever the focus is", async () => {
    renderGameScreen();
    menuHint().blur();
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
    expect(menuHint()).toBe(document.activeElement);
  });

  test("closes the pause menu with Continue and gives the focus back", async () => {
    renderGameScreen();
    await userEvent.click(menuHint());
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(pauseMenu()).toBeNull();
    expect(menuHint()).toBe(document.activeElement);
  });

  test("gives the focus to the key hint when it was on no control before the pause", async () => {
    renderGameScreen();
    menuHint().blur();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    expect(menuHint()).toBe(document.activeElement);
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
    menuHint().blur();
    await userEvent.keyboard("{F1}q{ArrowDown}");
    expect(pauseMenu()).toBeNull();
  });
});
