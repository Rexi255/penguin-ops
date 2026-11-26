// @vitest-environment jsdom
// Tests of the settings screen and its form in both languages (ADR 0109): the title, the
// language choice with every language named in itself and the system's language named in the
// player's language, the fullscreen switch with its help line, the focus on the chosen language,
// each control changing its setting at once, the alert after a failed write, and Back and Esc.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { DEFAULT_SETTINGS, type Settings } from "@penguin-ops/gameplay";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { SettingsScreen } from "./settings-screen";

const { uiCatalogs } = loadBundledContent();

const EXPECTED: Readonly<
  Record<
    MandatoryLanguage,
    {
      title: string;
      language: string;
      system: string;
      display: string;
      fullscreen: string;
      help: string;
      back: string;
      notSaved: string;
    }
  >
> = {
  en: {
    title: "Settings",
    language: "Language",
    system: "System language (German)",
    display: "Display",
    fullscreen: "Fullscreen",
    help: "F11 switches fullscreen on and off on every screen.",
    back: "Back",
    notSaved: "The settings could not be saved. They apply until you close the game.",
  },
  de: {
    title: "Einstellungen",
    language: "Sprache",
    system: "Systemsprache (Deutsch)",
    display: "Anzeige",
    fullscreen: "Vollbild",
    help: "F11 schaltet den Vollbildmodus auf jedem Bildschirm ein und aus.",
    back: "Zurück",
    notSaved:
      "Die Einstellungen konnten nicht gespeichert werden. Sie gelten, bis du das Spiel beendest.",
  },
};

function renderSettingsScreen(
  language: MandatoryLanguage,
  settings: Settings = { ...DEFAULT_SETTINGS, language },
  saveFailed = false,
) {
  const onChange = vi.fn<(next: Settings) => void>();
  const onBack = vi.fn<() => void>();
  const view = render(
    <TextsProvider texts={createTexts(uiCatalogs, language)}>
      <SettingsScreen
        settings={settings}
        locale="de-DE"
        onChange={onChange}
        saveFailed={saveFailed}
        onBack={onBack}
      />
    </TextsProvider>,
  );
  return { onChange, onBack, view };
}

afterEach(() => {
  cleanup();
});

describe("SettingsScreen", () => {
  test.each(MANDATORY_LANGUAGES)("names the screen and its groups in %s", (language) => {
    renderSettingsScreen(language);
    const expected = EXPECTED[language];
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(expected.title);
    expect(screen.getByRole("group", { name: expected.language })).toBeDefined();
    expect(screen.getByRole("group", { name: expected.display })).toBeDefined();
  });

  test.each(MANDATORY_LANGUAGES)("names every language in itself in %s", (language) => {
    renderSettingsScreen(language);
    const group = screen.getByRole("group", { name: EXPECTED[language].language });
    const choices = within(group).getAllByRole("radio");
    expect(choices.map((choice) => choice.closest("label")?.textContent)).toEqual([
      EXPECTED[language].system,
      "English",
      "Deutsch",
    ]);
    expect(
      choices.map((choice) => choice.nextElementSibling?.nextElementSibling?.getAttribute("lang")),
    ).toEqual([null, "en", "de"]);
  });

  test.each(MANDATORY_LANGUAGES)("explains F11 at the fullscreen switch in %s", (language) => {
    renderSettingsScreen(language);
    const fullscreen = screen.getByRole("checkbox", { name: EXPECTED[language].fullscreen });
    const help = fullscreen.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(help)?.textContent).toBe(EXPECTED[language].help);
  });

  test("shows the settings it gets", () => {
    renderSettingsScreen("en", { ...DEFAULT_SETTINGS, language: "system", fullscreen: false });
    expect(screen.getByRole("radio", { name: "System language (German)" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("radio", { name: "English" })).toHaveProperty("checked", false);
    expect(screen.getByRole("checkbox", { name: "Fullscreen" })).toHaveProperty("checked", false);
  });

  test("gives the chosen language the keyboard focus", () => {
    renderSettingsScreen("de");
    expect(screen.getByRole("radio", { name: "Deutsch" })).toBe(document.activeElement);
  });

  test("changes the language with the arrow keys", async () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, language: "en" };
    const { onChange } = renderSettingsScreen("en", settings);
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, language: "de" });
  });

  test("switches fullscreen with Space", async () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, language: "en", fullscreen: true };
    const { onChange } = renderSettingsScreen("en", settings);
    screen.getByRole("checkbox", { name: "Fullscreen" }).focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, fullscreen: false });
  });

  test.each(MANDATORY_LANGUAGES)("says so when the settings were not saved in %s", (language) => {
    renderSettingsScreen(language, { ...DEFAULT_SETTINGS, language }, true);
    expect(screen.getByRole("alert").textContent).toBe(EXPECTED[language].notSaved);
  });

  test("keeps the alert empty while the settings are saved", () => {
    renderSettingsScreen("en");
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  test.each(MANDATORY_LANGUAGES)("goes back with Back in %s", async (language) => {
    const { onBack } = renderSettingsScreen(language);
    await userEvent.click(screen.getByRole("button", { name: EXPECTED[language].back }));
    expect(onBack).toHaveBeenCalledExactlyOnceWith();
  });

  test("goes back with Esc, once while it is held down", async () => {
    const { onBack } = renderSettingsScreen("en");
    await userEvent.keyboard("{Escape>3/}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("stops listening for Esc when the screen is gone", async () => {
    const { onBack, view } = renderSettingsScreen("en");
    view.unmount();
    await userEvent.keyboard("{Escape}");
    expect(onBack).not.toHaveBeenCalled();
  });
});
