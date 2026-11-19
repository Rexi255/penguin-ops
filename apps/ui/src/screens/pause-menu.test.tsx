// @vitest-environment jsdom
// Tests of the pause menu in both languages: a modal dialog named by its title, with Continue and
// Main menu, the focus on Continue, and Esc, which returns to the game.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { PauseMenu } from "./pause-menu";

const { uiCatalogs } = loadBundledContent();

const EXPECTED: Readonly<
  Record<MandatoryLanguage, { title: string; continue: string; mainMenu: string }>
> = {
  en: { title: "Paused", continue: "Continue", mainMenu: "Main menu" },
  de: { title: "Pause", continue: "Weiterspielen", mainMenu: "Hauptmenü" },
};

function renderPauseMenu(language: MandatoryLanguage) {
  const onContinue = vi.fn<() => void>();
  const onMainMenu = vi.fn<() => void>();
  const view = render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <PauseMenu onContinue={onContinue} onMainMenu={onMainMenu} />
    </TextsProvider>,
  );
  return { onContinue, onMainMenu, view };
}

afterEach(() => {
  cleanup();
});

describe("PauseMenu", () => {
  test.each(MANDATORY_LANGUAGES)("is a modal dialog named by its title in %s", (language) => {
    renderPauseMenu(language);
    const dialog = screen.getByRole("dialog", { name: EXPECTED[language].title });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe(
      EXPECTED[language].title,
    );
  });

  test.each(MANDATORY_LANGUAGES)("offers Continue and Main menu in %s", (language) => {
    renderPauseMenu(language);
    const names = within(screen.getByRole("dialog"))
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(names).toEqual([EXPECTED[language].continue, EXPECTED[language].mainMenu]);
  });

  test.each(MANDATORY_LANGUAGES)("gives Continue the keyboard focus in %s", (language) => {
    renderPauseMenu(language);
    expect(screen.getByRole("button", { name: EXPECTED[language].continue })).toBe(
      document.activeElement,
    );
  });

  test("continues when the player clicks Continue", async () => {
    const { onContinue, onMainMenu } = renderPauseMenu("en");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledExactlyOnceWith();
    expect(onMainMenu).not.toHaveBeenCalled();
  });

  test("continues when the player presses Enter on the focused Continue", async () => {
    const { onContinue } = renderPauseMenu("de");
    await userEvent.keyboard("{Enter}");
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("goes to the main menu when the player clicks Main menu", async () => {
    const { onContinue, onMainMenu } = renderPauseMenu("en");
    await userEvent.click(screen.getByRole("button", { name: "Main menu" }));
    expect(onMainMenu).toHaveBeenCalledExactlyOnceWith();
    expect(onContinue).not.toHaveBeenCalled();
  });

  test("continues when the player presses Esc, wherever the focus is", async () => {
    const { onContinue, onMainMenu } = renderPauseMenu("en");
    screen.getByRole("button", { name: "Main menu" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(onContinue).toHaveBeenCalledExactlyOnceWith();
    expect(onMainMenu).not.toHaveBeenCalled();
  });

  test("continues only once when Esc is held down", async () => {
    const { onContinue } = renderPauseMenu("en");
    await userEvent.keyboard("{Escape>3/}");
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("ignores other keys", async () => {
    const { onContinue, onMainMenu } = renderPauseMenu("en");
    screen.getByRole("button", { name: "Continue" }).blur();
    await userEvent.keyboard("{F1}q{ArrowDown}");
    expect(onContinue).not.toHaveBeenCalled();
    expect(onMainMenu).not.toHaveBeenCalled();
  });

  test("stops listening for Esc when the menu is gone", async () => {
    const { onContinue, view } = renderPauseMenu("en");
    view.unmount();
    await userEvent.keyboard("{Escape}");
    expect(onContinue).not.toHaveBeenCalled();
  });
});
