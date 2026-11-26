// @vitest-environment jsdom
// Tests of the settings dialog of the game in both languages (ADR 0012, ADR 0109): a modal dialog
// named by its title, Back and Esc returning to the pause menu, and the question before a new
// language restarts the tickets, which a language setting that keeps the game's language does not
// ask.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { DEFAULT_SETTINGS, type Settings } from "@penguin-ops/gameplay";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { SettingsDialog } from "./settings-dialog";

const { uiCatalogs } = loadBundledContent();

const EXPECTED: Readonly<
  Record<
    MandatoryLanguage,
    {
      title: string;
      back: string;
      other: string;
      question: string;
      text: string;
      cancel: string;
      restart: string;
    }
  >
> = {
  en: {
    title: "Settings",
    back: "Back",
    other: "Deutsch",
    question: "Switch the language?",
    text: "Your tickets start again in the new language from their last checkpoint. Your progress is kept.",
    cancel: "Cancel",
    restart: "Switch language",
  },
  de: {
    title: "Einstellungen",
    back: "Zurück",
    other: "English",
    question: "Sprache wechseln?",
    text: "Deine Tickets beginnen in der neuen Sprache noch einmal ab ihrem letzten Checkpoint. Dein Fortschritt bleibt erhalten.",
    cancel: "Abbrechen",
    restart: "Sprache wechseln",
  },
};

function renderSettingsDialog(language: MandatoryLanguage, locale = "en-US") {
  const settings: Settings = { ...DEFAULT_SETTINGS, language };
  const onChange = vi.fn<(next: Settings) => void>();
  const onRestart = vi.fn<(next: Settings) => void>();
  const onBack = vi.fn<() => void>();
  render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <SettingsDialog
        settings={settings}
        locale={locale}
        onChange={onChange}
        onRestart={onRestart}
        saveFailed={false}
        onBack={onBack}
      />
    </TextsProvider>,
  );
  return { settings, onChange, onRestart, onBack };
}

function dialog(language: MandatoryLanguage) {
  return screen.getByRole("dialog", { name: EXPECTED[language].title });
}

afterEach(() => {
  cleanup();
});

describe("SettingsDialog", () => {
  test.each(MANDATORY_LANGUAGES)("is a modal dialog named by its title in %s", (language) => {
    renderSettingsDialog(language);
    expect(dialog(language).getAttribute("aria-modal")).toBe("true");
    expect(within(dialog(language)).getByRole("heading", { level: 2 }).textContent).toBe(
      EXPECTED[language].title,
    );
  });

  test.each(MANDATORY_LANGUAGES)("returns to the pause menu with Back in %s", async (language) => {
    const { onBack } = renderSettingsDialog(language);
    await userEvent.click(screen.getByRole("button", { name: EXPECTED[language].back }));
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("returns to the pause menu with Esc", async () => {
    const { onBack } = renderSettingsDialog("en");
    await userEvent.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("changes a setting other than the language at once", async () => {
    const { settings, onChange, onRestart } = renderSettingsDialog("en");
    await userEvent.click(screen.getByRole("checkbox", { name: "Fullscreen" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, fullscreen: false });
    expect(onRestart).not.toHaveBeenCalled();
  });

  test.each(MANDATORY_LANGUAGES)(
    "asks before a new language restarts the tickets in %s",
    async (language) => {
      const { onChange, onRestart } = renderSettingsDialog(language);
      await userEvent.click(screen.getByRole("radio", { name: EXPECTED[language].other }));
      const question = screen.getByRole("alertdialog", { name: EXPECTED[language].question });
      expect(question.textContent).toContain(EXPECTED[language].text);
      expect(within(question).getByRole("button", { name: EXPECTED[language].cancel })).toBe(
        document.activeElement,
      );
      // The settings behind the question take neither focus nor clicks.
      expect(dialog(language).hasAttribute("inert")).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
      expect(onRestart).not.toHaveBeenCalled();
    },
  );

  test("restarts in the new language when the player confirms", async () => {
    const { settings, onChange, onRestart, onBack } = renderSettingsDialog("en");
    await userEvent.click(screen.getByRole("radio", { name: "Deutsch" }));
    await userEvent.click(screen.getByRole("button", { name: "Switch language" }));
    expect(onRestart).toHaveBeenCalledExactlyOnceWith({ ...settings, language: "de" });
    expect(onChange).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  test("keeps the language and the dialog when the player cancels with Esc", async () => {
    const { onChange, onRestart, onBack } = renderSettingsDialog("en");
    await userEvent.click(screen.getByRole("radio", { name: "Deutsch" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(dialog("en").hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("radio", { name: "English" })).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: "English" })).toBe(document.activeElement);
    expect(onChange).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  test("asks when the system's language differs from the game's", async () => {
    const { onRestart } = renderSettingsDialog("en", "de-DE");
    await userEvent.click(screen.getByRole("radio", { name: "System language (German)" }));
    await userEvent.click(screen.getByRole("button", { name: "Switch language" }));
    expect(onRestart).toHaveBeenCalledExactlyOnceWith({ ...DEFAULT_SETTINGS, language: "system" });
  });

  test("does not ask when the system's language is the game's", async () => {
    const { onChange } = renderSettingsDialog("de", "de-AT");
    await userEvent.click(screen.getByRole("radio", { name: "Systemsprache (Deutsch)" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...DEFAULT_SETTINGS, language: "system" });
  });
});
