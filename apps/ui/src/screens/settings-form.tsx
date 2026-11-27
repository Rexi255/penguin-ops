// The settings themselves (ROADMAP M3.8b, M3.8c, M3.9, M3.10, ADR 0109 to ADR 0113), the same
// on the settings screen of the main menu and in the settings dialog of the pause menu: the
// language, the display (fullscreen and the font size), the colour scheme, the effects (ADR 0112),
// "reduce motion" and the volumes (ADR 0113). Each control changes its setting at once; the screen
// or dialog around it decides what a change of the language needs first. The music volume is
// offered before there is music, with a help line that says so (ADR 0113).

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
  VOLUME_MAX,
  VOLUME_MIN,
  type Volumes,
} from "@penguin-ops/gameplay";
import { Fragment, type Ref, useId } from "react";

import { Icon } from "../icons/icon";
import { InlineText } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import type { UiTextKey } from "../texts/ui-texts";

/** The font size slider moves in steps of 10 percent, from 80 to 200. */
const FONT_SIZE_STEP = 10;

/** The volume sliders move in steps of 5 percent, from 0 to 100. */
const VOLUME_STEP = 5;

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
  const effectsHelpId = `${id}-effects-help`;
  const reduceMotionHelpId = `${id}-reduce-motion-help`;
  const musicHelpId = `${id}-music-help`;
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
        <Slider
          id={`${id}-font-size`}
          labelKey="settings.font-size"
          valueText={texts.plain("settings.font-size-value", { percent: settings.fontSize })}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={FONT_SIZE_STEP}
          value={settings.fontSize}
          onChange={(fontSize) => {
            onChange({ ...settings, fontSize });
          }}
        />
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

      <fieldset className="settings__group">
        <legend className="settings__legend">
          <InlineText text={texts.rich("settings.sound")} textKey="settings.sound" />
        </legend>
        {VOLUMES.map((volume) => (
          <Fragment key={volume}>
            <Slider
              id={`${id}-volume-${volume}`}
              labelKey={volumeKey(volume)}
              valueText={texts.plain("settings.volume-value", {
                percent: settings.volumes[volume],
              })}
              min={VOLUME_MIN}
              max={VOLUME_MAX}
              step={VOLUME_STEP}
              value={settings.volumes[volume]}
              describedBy={volume === "music" ? musicHelpId : undefined}
              onChange={(value) => {
                onChange({ ...settings, volumes: { ...settings.volumes, [volume]: value } });
              }}
            />
            {/* The help line stands right under the slider it belongs to. */}
            {volume === "music" && (
              <p id={musicHelpId} className="field__help">
                <InlineText
                  text={texts.rich("settings.music-help")}
                  textKey="settings.music-help"
                />
              </p>
            )}
          </Fragment>
        ))}
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

interface SliderProps {
  readonly id: string;
  readonly labelKey: "settings.font-size" | ReturnType<typeof volumeKey>;
  /** The value as the slider shows it next to its label and tells screen readers. */
  readonly valueText: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  /** The ID of the slider's help line, if it has one. */
  readonly describedBy?: string | undefined;
  readonly onChange: (value: number) => void;
}

/** A slider with its label and its value written out next to it. */
function Slider({
  id,
  labelKey,
  valueText,
  min,
  max,
  step,
  value,
  describedBy,
  onChange,
}: SliderProps) {
  const texts = useTexts();
  return (
    <div className="slider">
      <div className="slider__head">
        <label className="slider__label" htmlFor={id}>
          <InlineText text={texts.rich(labelKey)} textKey={labelKey} />
        </label>
        <output className="slider__value" htmlFor={id}>
          {valueText}
        </output>
      </div>
      <input
        id={id}
        className="slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        aria-describedby={describedBy}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      />
    </div>
  );
}

/** The volumes, in the order the form shows them. */
const VOLUMES: readonly (keyof Volumes)[] = ["master", "music", "effects"];

/** The catalog key of a volume's slider. */
function volumeKey(
  volume: keyof Volumes,
): "settings.volume-master" | "settings.volume-music" | "settings.volume-effects" {
  switch (volume) {
    case "master":
      return "settings.volume-master";
    case "music":
      return "settings.volume-music";
    case "effects":
      return "settings.volume-effects";
  }
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
