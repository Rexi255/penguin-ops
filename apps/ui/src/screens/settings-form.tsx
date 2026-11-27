// The settings themselves (ROADMAP M3.8b, M3.8c, M3.9, ADR 0109 to ADR 0112), the same
// on the settings screen of the main menu and in the settings dialog of the pause menu: the
// language, the display (fullscreen and the font size), the colour scheme, the effects (ADR 0112)
// and "reduce motion". Each control changes its setting at once; the screen or dialog around it
// decides what a change of the language needs first. The form offers only settings that take
// effect (ADR 0108): the volumes come with ROADMAP M3.10.

import {
  COLOR_SCHEMES,
  type ColorScheme,
  type Effects,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  gameLanguage,
  LANGUAGE_SETTINGS,
  type LanguageSetting,
  REDUCE_MOTION_SETTINGS,
  type ReduceMotionSetting,
  type Settings,
} from "@penguin-ops/gameplay";
import { type Ref, useId } from "react";

import { Icon } from "../icons/icon";
import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import type { UiTextKey } from "../texts/ui-texts";

/** The font size slider moves in steps of 10 percent, from 80 to 200. */
const FONT_SIZE_STEP = 10;

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
  const fontSizeId = `${id}-font-size`;
  const effectsHelpId = `${id}-effects-help`;
  const reduceMotionHelpId = `${id}-reduce-motion-help`;
  const fontSizeText = texts.plain("settings.font-size-value", { percent: settings.fontSize });
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
        <div className="slider">
          <div className="slider__head">
            <label className="slider__label" htmlFor={fontSizeId}>
              <InlineText text={texts.rich("settings.font-size")} textKey="settings.font-size" />
            </label>
            <output className="slider__value" htmlFor={fontSizeId}>
              {fontSizeText}
            </output>
          </div>
          <input
            id={fontSizeId}
            className="slider__input"
            type="range"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={FONT_SIZE_STEP}
            value={settings.fontSize}
            aria-valuetext={fontSizeText}
            onChange={(event) => {
              onChange({ ...settings, fontSize: Number(event.target.value) });
            }}
          />
        </div>
      </fieldset>

      <fieldset className="settings__group">
        <legend className="settings__legend">
          <InlineText text={texts.rich("settings.color-scheme")} textKey="settings.color-scheme" />
        </legend>
        <div className="choices">
          {COLOR_SCHEMES.map((colorScheme) => {
            const key = colorSchemeKey(colorScheme);
            return (
              <label key={colorScheme} className="choice">
                <input
                  className="choice__input visually-hidden"
                  type="radio"
                  name={`${id}-color-scheme`}
                  value={colorScheme}
                  checked={settings.colorScheme === colorScheme}
                  onChange={() => {
                    onChange({ ...settings, colorScheme });
                  }}
                />
                <span className="choice__marker" aria-hidden="true" />
                <InlineText text={texts.rich(key)} textKey={key} />
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="settings__group" aria-describedby={effectsHelpId}>
        <legend className="settings__legend">
          <InlineText text={texts.rich("settings.effects")} textKey="settings.effects" />
        </legend>
        <div className="choices">
          {EFFECTS.map((effect) => {
            const key = effectKey(effect);
            return (
              <label key={effect} className="choice">
                <input
                  className="choice__input visually-hidden"
                  type="checkbox"
                  checked={settings.effects[effect]}
                  onChange={(event) => {
                    onChange({
                      ...settings,
                      effects: { ...settings.effects, [effect]: event.target.checked },
                    });
                  }}
                />
                <span className="choice__marker choice__marker--box" aria-hidden="true" />
                <InlineText text={texts.rich(key)} textKey={key} />
              </label>
            );
          })}
        </div>
        <p id={effectsHelpId} className="field__help">
          <InlineText text={texts.rich("settings.effects-help")} textKey="settings.effects-help" />
        </p>
      </fieldset>

      <fieldset className="settings__group" aria-describedby={reduceMotionHelpId}>
        <legend className="settings__legend">
          <InlineText
            text={texts.rich("settings.reduce-motion")}
            textKey="settings.reduce-motion"
          />
        </legend>
        <div className="choices">
          {REDUCE_MOTION_SETTINGS.map((reduceMotion) => {
            const key = reduceMotionKey(reduceMotion);
            return (
              <label key={reduceMotion} className="choice">
                <input
                  className="choice__input visually-hidden"
                  type="radio"
                  name={`${id}-reduce-motion`}
                  value={reduceMotion}
                  checked={settings.reduceMotion === reduceMotion}
                  onChange={() => {
                    onChange({ ...settings, reduceMotion });
                  }}
                />
                <span className="choice__marker" aria-hidden="true" />
                <InlineText text={texts.rich(key)} textKey={key} />
              </label>
            );
          })}
        </div>
        <p id={reduceMotionHelpId} className="field__help">
          <InlineText
            text={texts.rich("settings.reduce-motion-help")}
            textKey="settings.reduce-motion-help"
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

/** The effects, in the order the form shows them. */
const EFFECTS: readonly (keyof Effects)[] = ["glow", "scanlines"];

/** The catalog key of an effect's switch. */
function effectKey(effect: keyof Effects): "settings.effects-glow" | "settings.effects-scanlines" {
  switch (effect) {
    case "glow":
      return "settings.effects-glow";
    case "scanlines":
      return "settings.effects-scanlines";
  }
}

/** The catalog key of a colour scheme choice. */
function colorSchemeKey(scheme: ColorScheme): UiTextKey & `settings.color-scheme-${string}` {
  switch (scheme) {
    case "default":
      return "settings.color-scheme-default";
    case "retro-crt":
      return "settings.color-scheme-retro-crt";
    case "solarized":
      return "settings.color-scheme-solarized";
    case "high-contrast":
      return "settings.color-scheme-high-contrast";
  }
}

/** The catalog key of a "reduce motion" choice. */
function reduceMotionKey(
  setting: ReduceMotionSetting,
): "settings.reduce-motion-system" | "settings.reduce-motion-on" | "settings.reduce-motion-off" {
  switch (setting) {
    case "system":
      return "settings.reduce-motion-system";
    case "on":
      return "settings.reduce-motion-on";
    case "off":
      return "settings.reduce-motion-off";
  }
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
