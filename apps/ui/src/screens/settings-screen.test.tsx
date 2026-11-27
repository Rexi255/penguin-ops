// @vitest-environment jsdom
// Tests of the settings screen and its form in both languages (ADR 0109, ADR 0110, ADR 0113): the
// title, the language choice with every language named in itself and the system's language named
// in the player's language, the fullscreen switch with its help line, the font size slider, the
// colour scheme choice, the "reduce motion" choice, the volume sliders with the music's help line,
// the focus on the chosen language, each control changing its setting at once, the alert after a
// failed write, and Back and Esc.
import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { DEFAULT_SETTINGS, type Settings } from "@penguin-ops/gameplay";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadBundledContent } from "../content/bundled-content";
import { TextsProvider } from "../texts/texts-context";
import { createTexts } from "../texts/ui-texts";
import { categoryAfterKey, SETTINGS_CATEGORIES } from "./settings-form";
import { SettingsScreen } from "./settings-screen";

const { uiCatalogs } = loadBundledContent();

/** The categories of the settings, which the list shows in this order. */
type Category = "general" | "display" | "sound";

const EXPECTED: Readonly<
  Record<
    MandatoryLanguage,
    {
      title: string;
      language: string;
      system: string;
      display: string;
      categories: Record<Category, string>;
      fullscreen: string;
      help: string;
      back: string;
      notSaved: string;
      fontSize: string;
      fontSizeValue: string;
      colorScheme: string;
      colorSchemeChoices: string[];
      effects: string;
      effectChoices: string[];
      effectsHelp: string;
      reduceMotion: string;
      reduceMotionChoices: string[];
      reduceMotionHelp: string;
      sound: string;
      volumes: readonly [master: string, music: string, effects: string];
      volumeValue: string;
      musicHelp: string;
    }
  >
> = {
  en: {
    title: "Settings",
    language: "Language",
    system: "System language (German)",
    display: "Screen",
    categories: { general: "General", display: "Display", sound: "Sound" },
    fullscreen: "Fullscreen",
    help: "F11 switches fullscreen on and off on every screen.",
    back: "Back",
    notSaved: "The settings could not be saved. They apply until you close the game.",
    fontSize: "Font size",
    fontSizeValue: "120%",
    colorScheme: "Colour scheme",
    colorSchemeChoices: ["Default", "Retro CRT", "Solarized", "High contrast"],
    effects: "Effects",
    effectChoices: ["Glow", "Scanlines"],
    effectsHelp:
      "Only in the terminal. Reduce motion turns them off, also when the system asks for it.",
    reduceMotion: "Reduce motion",
    reduceMotionChoices: ["Like the system", "On", "Off"],
    reduceMotionHelp: "Shows every change at once, without animations and effects.",
    sound: "Sound",
    volumes: ["Master volume", "Music", "Sound effects"],
    volumeValue: "35%",
    musicHelp: "There is no music yet. Its volume applies as soon as it arrives.",
  },
  de: {
    title: "Einstellungen",
    language: "Sprache",
    system: "Systemsprache (Deutsch)",
    display: "Bildschirm",
    categories: { general: "Allgemein", display: "Anzeige", sound: "Ton" },
    fullscreen: "Vollbild",
    help: "F11 schaltet den Vollbildmodus auf jedem Bildschirm ein und aus.",
    back: "Zurück",
    notSaved:
      "Die Einstellungen konnten nicht gespeichert werden. Sie gelten, bis du das Spiel beendest.",
    fontSize: "Schriftgröße",
    fontSizeValue: "120 %",
    colorScheme: "Farbschema",
    colorSchemeChoices: ["Standard", "Retro-CRT", "Solarized", "Hoher Kontrast"],
    effects: "Effekte",
    effectChoices: ["Leuchten", "Scanlines"],
    effectsHelp:
      "Nur im Terminal. „Bewegung reduzieren“ schaltet sie ab, auch wenn das System es verlangt.",
    reduceMotion: "Bewegung reduzieren",
    reduceMotionChoices: ["Wie im System", "An", "Aus"],
    reduceMotionHelp: "Zeigt jede Änderung sofort, ohne Animationen und Effekte.",
    sound: "Ton",
    volumes: ["Gesamtlautstärke", "Musik", "Soundeffekte"],
    volumeValue: "35 %",
    musicHelp: "Musik gibt es noch nicht. Ihre Lautstärke gilt, sobald sie da ist.",
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

/** Chooses a category in the list, which shows its settings. */
function openCategory(language: MandatoryLanguage, category: Category) {
  fireEvent.click(screen.getByRole("tab", { name: EXPECTED[language].categories[category] }));
}

/** The text of the label of `control`. */
function labelOf(control: HTMLElement): string | null | undefined {
  return document.querySelector(`label[for="${control.id}"]`)?.textContent;
}

/** The value that the slider's output shows next to its label. */
function valueShownFor(slider: HTMLElement): string | null | undefined {
  return document.querySelector(`output[for="${slider.id}"]`)?.textContent;
}

describe("SettingsScreen", () => {
  test.each(MANDATORY_LANGUAGES)("names the screen and its groups in %s", (language) => {
    renderSettingsScreen(language);
    const expected = EXPECTED[language];
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(expected.title);
    expect(screen.getByRole("group", { name: expected.language })).toBeDefined();
    expect(screen.getByRole("group", { name: expected.reduceMotion })).toBeDefined();
    openCategory(language, "display");
    expect(screen.getByRole("group", { name: expected.display })).toBeDefined();
    expect(screen.getByRole("group", { name: expected.colorScheme })).toBeDefined();
    expect(screen.getByRole("group", { name: expected.effects })).toBeDefined();
    openCategory(language, "sound");
    expect(screen.getByRole("group", { name: expected.sound })).toBeDefined();
  });

  test.each(MANDATORY_LANGUAGES)("lists the categories, General chosen, in %s", (language) => {
    renderSettingsScreen(language);
    const list = screen.getByRole("tablist");
    expect(list.getAttribute("aria-orientation")).toBe("vertical");
    const tabs = within(list).getAllByRole("tab");
    const { categories } = EXPECTED[language];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      categories.general,
      categories.display,
      categories.sound,
    ]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole("tabpanel", { name: categories.general })).toBeDefined();
  });

  test("shows only the chosen category's settings", async () => {
    renderSettingsScreen("en");
    expect(screen.queryByRole("group", { name: "Colour scheme" })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Display" }));
    expect(screen.getByRole("tab", { name: "Display" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe(
      "false",
    );
    expect(screen.getByRole("group", { name: "Colour scheme" })).toBeDefined();
    expect(screen.queryByRole("group", { name: "Language" })).toBeNull();
    expect(screen.getByRole("tabpanel").textContent).not.toContain("Language");
  });

  test("moves between the categories with the arrow keys, Home and End", async () => {
    renderSettingsScreen("en");
    screen.getByRole("tab", { name: "General" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "Display" })).toBe(document.activeElement);
    expect(screen.getByRole("tab", { name: "Display" }).getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Sound" })).toBe(document.activeElement);
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "General" })).toBe(document.activeElement);
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "Sound" })).toBe(document.activeElement);
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "General" })).toBe(document.activeElement);
    expect(screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("true");
  });

  test("leaves keys with a modifier and other keys to the browser", async () => {
    renderSettingsScreen("en");
    screen.getByRole("tab", { name: "General" }).focus();
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    await userEvent.keyboard("a");
    expect(screen.getByRole("tab", { name: "General" })).toBe(document.activeElement);
    expect(screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("true");
  });

  test("keeps Back in the footer, named Back, with Esc as its shortcut", () => {
    renderSettingsScreen("en");
    const back = screen.getByRole("button", { name: "Back" });
    expect(back.closest("footer")).not.toBeNull();
    expect(back.getAttribute("aria-keyshortcuts")).toBe("Escape");
    expect(back.textContent).toContain("Esc");
  });

  test("keeps the alert in the footer", () => {
    renderSettingsScreen("en", { ...DEFAULT_SETTINGS, language: "en" }, true);
    expect(screen.getByRole("alert").closest("footer")).not.toBeNull();
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
    openCategory(language, "display");
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
    openCategory("en", "display");
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
    openCategory("en", "display");
    screen.getByRole("checkbox", { name: "Fullscreen" }).focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, fullscreen: false });
  });

  test.each(MANDATORY_LANGUAGES)("shows the font size as a slider in %s", (language) => {
    renderSettingsScreen(language, { ...DEFAULT_SETTINGS, language, fontSize: 120 });
    openCategory(language, "display");
    const slider = screen.getByRole("slider", { name: EXPECTED[language].fontSize });
    expect(slider.getAttribute("min")).toBe("80");
    expect(slider.getAttribute("max")).toBe("200");
    expect(slider.getAttribute("step")).toBe("10");
    expect(slider).toHaveProperty("value", "120");
    expect(slider.getAttribute("aria-valuetext")).toBe(EXPECTED[language].fontSizeValue);
    expect(valueShownFor(slider)).toBe(EXPECTED[language].fontSizeValue);
  });

  // jsdom does not move a slider with the keyboard; the end-to-end tests press the keys.
  test.each([80, 110, 200])("changes the font size to %i percent", (fontSize) => {
    const settings: Settings = { ...DEFAULT_SETTINGS, language: "en" };
    const { onChange } = renderSettingsScreen("en", settings);
    openCategory("en", "display");
    fireEvent.change(screen.getByRole("slider", { name: "Font size" }), {
      target: { value: String(fontSize) },
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, fontSize });
  });

  test.each(MANDATORY_LANGUAGES)("shows the volumes as sliders in %s", (language) => {
    const volumes = { master: 35, music: 60, effects: 0 };
    renderSettingsScreen(language, { ...DEFAULT_SETTINGS, language, volumes });
    openCategory(language, "sound");
    const expected = EXPECTED[language];
    const group = screen.getByRole("group", { name: expected.sound });
    const sliders = within(group).getAllByRole("slider");
    expect(sliders.map((slider) => labelOf(slider))).toEqual(expected.volumes);
    for (const slider of sliders) {
      expect(slider.getAttribute("min")).toBe("0");
      expect(slider.getAttribute("max")).toBe("100");
      expect(slider.getAttribute("step")).toBe("5");
    }
    expect(sliders.map((slider) => (slider as HTMLInputElement).value)).toEqual(["35", "60", "0"]);
    const master = screen.getByRole("slider", { name: expected.volumes[0] });
    expect(master.getAttribute("aria-valuetext")).toBe(expected.volumeValue);
    expect(valueShownFor(master)).toBe(expected.volumeValue);
  });

  test.each(MANDATORY_LANGUAGES)(
    "says at the music volume that there is no music yet in %s",
    (language) => {
      renderSettingsScreen(language);
      openCategory(language, "sound");
      const expected = EXPECTED[language];
      const music = screen.getByRole("slider", { name: expected.volumes[1] });
      const help = music.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(help)?.textContent).toBe(expected.musicHelp);
      for (const name of [expected.volumes[0], expected.volumes[2]]) {
        expect(screen.getByRole("slider", { name }).hasAttribute("aria-describedby")).toBe(false);
      }
    },
  );

  test.each([
    ["Master volume", { master: 0 }],
    ["Music", { music: 100 }],
    ["Sound effects", { effects: 45 }],
  ] as const)("changes the %s", (name, change) => {
    const settings: Settings = { ...DEFAULT_SETTINGS, language: "en" };
    const { onChange } = renderSettingsScreen("en", settings);
    openCategory("en", "sound");
    const value = Object.values(change)[0];
    fireEvent.change(screen.getByRole("slider", { name }), {
      target: { value: String(value) },
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...settings,
      volumes: { ...settings.volumes, ...change },
    });
  });

  test.each(MANDATORY_LANGUAGES)("offers the colour schemes in %s", (language) => {
    renderSettingsScreen(language, { ...DEFAULT_SETTINGS, language, colorScheme: "solarized" });
    openCategory(language, "display");
    const group = screen.getByRole("group", { name: EXPECTED[language].colorScheme });
    const choices = within(group).getAllByRole("radio");
    expect(choices.map((choice) => choice.closest("label")?.textContent)).toEqual(
      EXPECTED[language].colorSchemeChoices,
    );
    expect(choices.map((choice) => (choice as HTMLInputElement).checked)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  test.each([
    ["Retro CRT", "retro-crt"],
    ["High contrast", "high-contrast"],
    ["Default", "default"],
  ] as const)("changes the colour scheme to %s", async (name, colorScheme) => {
    const settings: Settings = { ...DEFAULT_SETTINGS, language: "en", colorScheme: "solarized" };
    const { onChange } = renderSettingsScreen("en", settings);
    openCategory("en", "display");
    await userEvent.click(screen.getByRole("radio", { name }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, colorScheme });
  });

  test("keeps the colour scheme when the chosen one is clicked again", async () => {
    const { onChange } = renderSettingsScreen("en");
    openCategory("en", "display");
    await userEvent.click(screen.getByRole("radio", { name: "Default" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test.each(MANDATORY_LANGUAGES)("offers the effects, both off by default, in %s", (language) => {
    renderSettingsScreen(language);
    openCategory(language, "display");
    const group = screen.getByRole("group", { name: EXPECTED[language].effects });
    const switches = within(group).getAllByRole("checkbox");
    expect(switches.map((choice) => choice.closest("label")?.textContent)).toEqual(
      EXPECTED[language].effectChoices,
    );
    expect(switches.map((choice) => (choice as HTMLInputElement).checked)).toEqual([false, false]);
    const help = group.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(help)?.textContent).toBe(EXPECTED[language].effectsHelp);
  });

  test("shows the effects that are on as checked", () => {
    renderSettingsScreen("en", {
      ...DEFAULT_SETTINGS,
      language: "en",
      effects: { glow: false, scanlines: true },
    });
    openCategory("en", "display");
    expect(screen.getByRole("checkbox", { name: "Glow" })).toHaveProperty("checked", false);
    expect(screen.getByRole("checkbox", { name: "Scanlines" })).toHaveProperty("checked", true);
  });

  test.each([
    ["Glow", { glow: true, scanlines: false }],
    ["Scanlines", { glow: false, scanlines: true }],
  ] as const)("turns %s on and keeps the other effect", async (name, effects) => {
    const settings: Settings = { ...DEFAULT_SETTINGS, language: "en" };
    const { onChange } = renderSettingsScreen("en", settings);
    openCategory("en", "display");
    await userEvent.click(screen.getByRole("checkbox", { name }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, effects });
  });

  test("turns an effect off with the keyboard", async () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      language: "en",
      effects: { glow: true, scanlines: true },
    };
    const { onChange } = renderSettingsScreen("en", settings);
    openCategory("en", "display");
    screen.getByRole("checkbox", { name: "Glow" }).focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...settings,
      effects: { glow: false, scanlines: true },
    });
  });

  test.each(MANDATORY_LANGUAGES)("offers the choices of reduce motion in %s", (language) => {
    renderSettingsScreen(language);
    const group = screen.getByRole("group", { name: EXPECTED[language].reduceMotion });
    const choices = within(group).getAllByRole("radio");
    expect(choices.map((choice) => choice.closest("label")?.textContent)).toEqual(
      EXPECTED[language].reduceMotionChoices,
    );
    expect(choices.map((choice) => (choice as HTMLInputElement).checked)).toEqual([
      true,
      false,
      false,
    ]);
    const help = group.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(help)?.textContent).toBe(EXPECTED[language].reduceMotionHelp);
  });

  test("changes reduce motion", async () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, language: "en" };
    const { onChange } = renderSettingsScreen("en", settings);
    await userEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, reduceMotion: "off" });
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

describe("categoryAfterKey", () => {
  test.each([
    ["ArrowDown", 0, "display"],
    ["ArrowDown", 2, "general"],
    ["ArrowUp", 0, "sound"],
    ["ArrowUp", 2, "display"],
    ["Home", 2, "general"],
    ["End", 0, "sound"],
  ] as const)("moves from the category at %s, %i to %s", (key, index, expected) => {
    expect(categoryAfterKey(key, index)).toBe(expected);
  });

  test.each(["ArrowLeft", "ArrowRight", "Enter", "a"])("leaves %s alone", (key) => {
    expect(categoryAfterKey(key, 1)).toBeUndefined();
  });

  test("knows the three categories in the order of the list", () => {
    expect(SETTINGS_CATEGORIES).toEqual(["general", "display", "sound"]);
  });
});
