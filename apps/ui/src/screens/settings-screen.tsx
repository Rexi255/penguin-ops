// The settings screen of the main menu (ROADMAP M3.8b, ADR 0109): the settings form under the
// screen's title, and Back, which Esc chooses too. Outside a game, a new language takes effect at
// once: no ticket is open that would have to restart.

import type { Settings } from "@penguin-ops/gameplay";
import { useEffect, useRef } from "react";

import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import { SettingsForm } from "./settings-form";

export interface SettingsScreenProps {
  readonly settings: Settings;
  /** The operating system's locale, which gives the language of the setting `system`. */
  readonly locale: string;
  /** Gets the settings with one of them changed. */
  readonly onChange: (next: Settings) => void;
  /** Whether the latest change could not be written. */
  readonly saveFailed: boolean;
  /** Returns to the start screen. */
  readonly onBack: () => void;
}

export function SettingsScreen({
  settings,
  locale,
  onChange,
  saveFailed,
  onBack,
}: SettingsScreenProps) {
  const texts = useTexts();
  const languageInput = useRef<HTMLInputElement>(null);

  // The keyboard is the main input (PRODUCT.md): the chosen language has the focus.
  useEffect(() => {
    languageInput.current?.focus();
  }, []);

  // Esc goes back, like on the other screens of the main menu.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.repeat) {
        event.preventDefault();
        onBack();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onBack]);

  return (
    <main className="settings-screen">
      <div className="settings-page">
        <h1 className="settings-page__title">
          <InlineText text={texts.rich("settings.title")} textKey="settings.title" />
        </h1>
        <SettingsForm
          settings={settings}
          locale={locale}
          onChange={onChange}
          saveFailed={saveFailed}
          languageInput={languageInput}
        />
        <div className="settings-page__actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              onBack();
            }}
          >
            <InlineText text={texts.rich("settings.back")} textKey="settings.back" />
          </button>
        </div>
      </div>
    </main>
  );
}
