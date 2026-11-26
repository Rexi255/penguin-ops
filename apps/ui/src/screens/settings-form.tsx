// The settings themselves (ROADMAP M3.8b, ADR 0109), the same on the settings screen of the main
// menu and in the settings dialog of the pause menu: the language and the display. Each control
// changes its setting at once; the screen or dialog around it decides what a change of the
// language needs first. The form offers only settings that take effect (ADR 0108).

import {
  gameLanguage,
  LANGUAGE_SETTINGS,
  type LanguageSetting,
  type Settings,
} from "@penguin-ops/gameplay";
import { type Ref, useId } from "react";

import { Icon } from "../icons/icon";
import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import type { UiTextKey } from "../texts/ui-texts";

export interface SettingsFormProps {
  readonly settings: Settings;
  /** The operating system's locale, which gives the language of the setting `system`. */
  readonly locale: string;
  /** Gets the settings with one of them changed. */
  readonly onChange: (next: Settings) => void;
  /** Whether the latest change could not be written; the form then says so. */
  readonly saveFailed: boolean;
  /** Gets the chosen language's radio button, which has the focus when the settings appear. */
  readonly languageInput?: Ref<HTMLInputElement>;
}

export function SettingsForm({
  settings,
  locale,
  onChange,
  saveFailed,
  languageInput,
}: SettingsFormProps) {
  const texts = useTexts();
  const id = useId();
  const fullscreenHelpId = `${id}-fullscreen-help`;
  const systemLanguage = gameLanguage("system", locale);

  return (
    <div className="settings">
      <fieldset className="settings__group">
        <legend className="settings__legend">
          <InlineText text={texts.rich("settings.language")} textKey="settings.language" />
        </legend>
        <div className="choices">
          {LANGUAGE_SETTINGS.map((language) => {
            const key = languageKey(language);
            const checked = settings.language === language;
            return (
              <label key={language} className="choice">
                <input
                  ref={checked ? languageInput : undefined}
                  className="choice__input visually-hidden"
                  type="radio"
                  name={`${id}-language`}
                  value={language}
                  checked={checked}
                  onChange={() => {
                    onChange({ ...settings, language });
                  }}
                />
                <span className="choice__marker" aria-hidden="true" />
                {/* A language is named in itself, so that the player finds their own. */}
                <span lang={language === "system" ? undefined : language}>
                  {key === "settings.language-system" ? (
                    <InlineText
                      text={texts.rich(key, {
                        language: texts.plain(languageNameKey(systemLanguage)),
                      })}
                      textKey={key}
                    />
                  ) : (
                    <InlineText text={texts.rich(key)} textKey={key} />
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="settings__group">
        <legend className="settings__legend">
          <InlineText text={texts.rich("settings.display")} textKey="settings.display" />
        </legend>
        <div className="choices">
          <label className="choice">
            <input
              className="choice__input visually-hidden"
              type="checkbox"
              checked={settings.fullscreen}
              aria-describedby={fullscreenHelpId}
              onChange={(event) => {
                onChange({ ...settings, fullscreen: event.target.checked });
              }}
            />
            <span className="choice__marker choice__marker--box" aria-hidden="true" />
            <InlineText text={texts.rich("settings.fullscreen")} textKey="settings.fullscreen" />
          </label>
        </div>
        <p id={fullscreenHelpId} className="field__help">
          <InlineText
            text={texts.rich("settings.fullscreen-help")}
            textKey="settings.fullscreen-help"
          />
        </p>
      </fieldset>

      {/* An alert, so that the player hears it at once; it stays until a write works again. */}
      <p className="settings__warning" role="alert">
        {saveFailed && (
          <>
            <Icon name="incident" />
            <InlineText text={texts.rich("settings.not-saved")} textKey="settings.not-saved" />
          </>
        )}
      </p>
    </div>
  );
}

/** The catalog key of a language choice. */
function languageKey(language: LanguageSetting): UiTextKey & `settings.language-${string}` {
  switch (language) {
    case "system":
      return "settings.language-system";
    case "en":
      return "settings.language-en";
    case "de":
      return "settings.language-de";
  }
}

/** The catalog key of a language's name in the player's language. */
function languageNameKey(language: "en" | "de"): "languages.en" | "languages.de" {
  switch (language) {
    case "en":
      return "languages.en";
    case "de":
      return "languages.de";
  }
}
