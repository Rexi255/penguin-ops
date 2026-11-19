// @vitest-environment jsdom
// Tests of the save slot screen in both languages: three empty slots that are not controls, and
// Back, which has the focus and also answers to Esc.
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
  Record<MandatoryLanguage, { title: string; slots: string[]; empty: string; back: string }>
> = {
  en: {
    title: "Choose a save slot",
    slots: ["Slot 1", "Slot 2", "Slot 3"],
    empty: "Empty",
    back: "Back",
  },
  de: {
    title: "Spielstand wählen",
    slots: ["Spielstand 1", "Spielstand 2", "Spielstand 3"],
    empty: "Leer",
    back: "Zurück",
  },
};

function renderSaveSlotScreen(language: MandatoryLanguage) {
  const onBack = vi.fn<() => void>();
  const view = render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <SaveSlotScreen onBack={onBack} />
    </TextsProvider>,
  );
  return { onBack, view };
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
    const { slots, empty } = EXPECTED[language];
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(slots.map((slot) => slot + empty));
  });

  test("keeps empty slots out of the controls and the tab order", async () => {
    renderSaveSlotScreen("en");
    const list = screen.getByRole("list");
    expect(within(list).queryAllByRole("button")).toEqual([]);
    expect(list.querySelectorAll("[tabindex], a, button, input")).toHaveLength(0);
    // From the start of the page, the first stop of Tab is Back.
    const back = screen.getByRole("button", { name: "Back" });
    back.blur();
    await userEvent.tab();
    expect(back).toBe(document.activeElement);
  });

  test.each(MANDATORY_LANGUAGES)("gives Back the keyboard focus in %s", (language) => {
    renderSaveSlotScreen(language);
    expect(screen.getByRole("button", { name: EXPECTED[language].back })).toBe(
      document.activeElement,
    );
  });

  test("goes back when the player clicks Back", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("goes back when the player presses Enter on the focused Back", async () => {
    const { onBack } = renderSaveSlotScreen("de");
    await userEvent.keyboard("{Enter}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("goes back when the player presses Esc", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    // Esc works wherever the focus is, also when it has left Back.
    screen.getByRole("button", { name: "Back" }).blur();
    await userEvent.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("goes back only once when Esc is held down", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    await userEvent.keyboard("{Escape>3/}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("ignores other keys", async () => {
    const { onBack } = renderSaveSlotScreen("en");
    screen.getByRole("button", { name: "Back" }).blur();
    await userEvent.keyboard("{F1}q{ArrowDown}");
    expect(onBack).not.toHaveBeenCalled();
  });

  test("stops listening for Esc when the screen is gone", async () => {
    const { onBack, view } = renderSaveSlotScreen("en");
    view.unmount();
    await userEvent.keyboard("{Escape}");
    expect(onBack).not.toHaveBeenCalled();
  });
});
