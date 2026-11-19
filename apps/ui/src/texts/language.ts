// The language of the game (ADR 0012): the operating system's locale until the settings of
// ROADMAP M3.8 store the player's choice. German if the locale starts with `de`, otherwise
// English.

import type { MandatoryLanguage } from "@penguin-ops/content";

/** The game's language for a BCP 47 locale such as `de-DE` or `en-US`. */
export function languageForLocale(locale: string): MandatoryLanguage {
  return /^de(?:-|$)/iu.test(locale) ? "de" : "en";
}
