// @vitest-environment jsdom
// Tests of the start screen in both languages with Testing Library, which renders the screen into
// jsdom's document and finds elements the way a player or a screen reader does: by role and name.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { StartScreen } from "./start-screen";

const { uiCatalogs } = loadBundledContent();

const MENU: Readonly<Record<MandatoryLanguage, { name: string; entries: string[] }>> = {
  en: { name: "Main menu", entries: ["Play", "Quit"] },
  de: { name: "Hauptmenü", entries: ["Spielen", "Beenden"] },
};

function renderStartScreen(language: MandatoryLanguage) {
  const onPlay = vi.fn<() => void>();
  const onQuit = vi.fn<() => void>();
  render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <StartScreen version="1.2.3" onPlay={onPlay} onQuit={onQuit} />
    </TextsProvider>,
  );
  return { onPlay, onQuit };
}

afterEach(() => {
  cleanup();
});

describe("StartScreen", () => {
  test.each(MANDATORY_LANGUAGES)("shows the logo as the level 1 heading in %s", (language) => {
    renderStartScreen(language);
    const heading = screen.getByRole("heading", { level: 1, name: "PenguinOps" });
    const logo = within(heading).getByRole("img", { name: "PenguinOps" });
    expect(logo.getAttribute("src")).toMatch(/logo-horizontal-dark\.svg/u);
  });

  test.each(MANDATORY_LANGUAGES)("names the menu and its entries in %s", (language) => {
    renderStartScreen(language);
    const menu = screen.getByRole("navigation", { name: MENU[language].name });
    const entries = within(menu).getAllByRole("button");
    expect(entries.map((entry) => entry.textContent)).toEqual(MENU[language].entries);
  });

  test("gives Play, the first menu entry, the keyboard focus", () => {
    renderStartScreen("en");
    expect(screen.getByRole("button", { name: "Play" })).toBe(document.activeElement);
  });

  test("plays when the player presses Enter on the focused entry", async () => {
    const { onPlay, onQuit } = renderStartScreen("de");
    await userEvent.keyboard("{Enter}");
    expect(onPlay).toHaveBeenCalledExactlyOnceWith();
    expect(onQuit).not.toHaveBeenCalled();
  });

  test("plays when the player chooses Play with the mouse", async () => {
    const { onPlay, onQuit } = renderStartScreen("en");
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onPlay).toHaveBeenCalledExactlyOnceWith();
    expect(onQuit).not.toHaveBeenCalled();
  });

  test("quits when the player chooses Quit with the mouse", async () => {
    const { onPlay, onQuit } = renderStartScreen("en");
    await userEvent.click(screen.getByRole("button", { name: "Quit" }));
    // Without arguments: the desktop API cannot take the click event.
    expect(onQuit).toHaveBeenCalledExactlyOnceWith();
    expect(onPlay).not.toHaveBeenCalled();
  });

  test("quits when the player moves to Quit with Tab and presses Enter", async () => {
    const { onPlay, onQuit } = renderStartScreen("de");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Beenden" })).toBe(document.activeElement);
    await userEvent.keyboard("{Enter}");
    expect(onQuit).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
  });

  test.each(MANDATORY_LANGUAGES)("shows the version as code in %s", (language) => {
    renderStartScreen(language);
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toBe("Version 1.2.3");
    expect(footer.querySelector("code")?.textContent).toBe("1.2.3");
  });

  test("needs a TextsProvider", () => {
    // React reports the error of a component on the console as well.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      render(<StartScreen version="1.2.3" onPlay={() => undefined} onQuit={() => undefined} />),
    ).toThrow("useTexts needs a TextsProvider above the component.");
    consoleError.mockRestore();
  });
});
