// @vitest-environment jsdom
// Tests of the save slot screen in both languages: three empty slots that start a new game, the
// first of which has the focus, and Back, which also answers to Esc.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { SAVE_SLOT_COUNT, SaveSlotScreen } from "./save-slot-screen";

const { uiCatalogs } = loadBundledContent();

const EXPECTED: Readonly<
  Record<
    MandatoryLanguage,
    {
      title: string;
      slots: string[];
      state: string;
      names: readonly [string, string, string];
      back: string;
    }
  >
> = {
  en: {
    title: "Choose a save slot",
    slots: ["Slot 1", "Slot 2", "Slot 3"],
    state: "New game",
    names: ["Slot 1 New game", "Slot 2 New game", "Slot 3 New game"],
    back: "Back",
  },
  de: {
    title: "Spielstand wählen",
    slots: ["Spielstand 1", "Spielstand 2", "Spielstand 3"],
    state: "Neues Spiel",
    names: ["Spielstand 1 Neues Spiel", "Spielstand 2 Neues Spiel", "Spielstand 3 Neues Spiel"],
    back: "Zurück",
  },
};

function renderSaveSlotScreen(language: MandatoryLanguage) {
  const onNewGame = vi.fn<() => void>();
  const onBack = vi.fn<() => void>();
  const view = render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <SaveSlotScreen onNewGame={onNewGame} onBack={onBack} />
    </TextsProvider>,
  );
  return { onNewGame, onBack, view };
}

afterEach(() => {
  cleanup();
});

describe("SaveSlotScreen", () => {
  test("has three slots (ADR 0013)", () => {
    expect(SAVE_SLOT_COUNT).toBe(3);
  });

  test.each(MANDATORY_LANGUAGES)("shows the title as the level 1 heading in %s", (language) => {
    renderSaveSlotScreen(language);
    expect(screen.getByRole("heading", { level: 1, name: EXPECTED[language].title })).toBeDefined();
  });

  test.each(MANDATORY_LANGUAGES)("lists three empty slots in %s", (language) => {
    renderSaveSlotScreen(language);
    const { slots, state } = EXPECTED[language];
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(slots.map((slot) => `${slot} ${state}`));
  });

  test.each(MANDATORY_LANGUAGES)(
    "names every empty slot by its visible texts in %s",
    (language) => {
      renderSaveSlotScreen(language);
      for (const name of EXPECTED[language].names) {
        expect(within(screen.getByRole("list")).getByRole("button", { name })).toBeDefined();
      }
      expect(within(screen.getByRole("list")).getAllByRole("button")).toHaveLength(SAVE_SLOT_COUNT);
    },
  );

  test.each(MANDATORY_LANGUAGES)("gives the first slot the keyboard focus in %s", (language) => {
    renderSaveSlotScreen(language);
    expect(screen.getByRole("button", { name: EXPECTED[language].names[0] })).toBe(
      document.activeElement,
    );
  });

  test("puts the slots before Back in the tab order", async () => {
    renderSaveSlotScreen("en");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Slot 2 New game" })).toBe(document.activeElement);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Slot 3 New game" })).toBe(document.activeElement);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Back" })).toBe(document.activeElement);
  });

  test.each([1, 2, 3])("starts a new game when the player clicks slot %i", async (number) => {
    const { onNewGame, onBack } = renderSaveSlotScreen("en");
    await userEvent.click(screen.getByRole("button", { name: `Slot ${String(number)} New game` }));
    expect(onNewGame).toHaveBeenCalledExactlyOnceWith();
    expect(onBack).not.toHaveBeenCalled();
  });

  test("starts a new game when the player presses Enter on the focused first slot", async () => {
    const { onNewGame } = renderSaveSlotScreen("de");
    await userEvent.keyboard("{Enter}");
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });

  test("goes back when the player clicks Back", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("goes back when the player presses Enter on Back", async () => {
    const { onBack, onNewGame } = renderSaveSlotScreen("de");
    screen.getByRole("button", { name: EXPECTED.de.back }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNewGame).not.toHaveBeenCalled();
  });

  test("goes back when the player presses Esc", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    // Esc works wherever the focus is, also when it is on no control.
    screen.getByRole("button", { name: "Slot 1 New game" }).blur();
    await userEvent.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("goes back only once when Esc is held down", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    await userEvent.keyboard("{Escape>3/}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("ignores other keys", async () => {
    const { onBack, onNewGame } = renderSaveSlotScreen("en");
    screen.getByRole("button", { name: "Slot 1 New game" }).blur();
    await userEvent.keyboard("{F1}q{ArrowDown}");
    expect(onBack).not.toHaveBeenCalled();
    expect(onNewGame).not.toHaveBeenCalled();
  });

  test("stops listening for Esc when the screen is gone", async () => {
    const { onBack, view } = renderSaveSlotScreen("en");
    view.unmount();
    await userEvent.keyboard("{Escape}");
    expect(onBack).not.toHaveBeenCalled();
  });
});
