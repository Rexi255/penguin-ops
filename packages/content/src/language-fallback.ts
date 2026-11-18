// The texts of a level or of the UI in one language (ADR 0012, ADR 0074). English and German
// catalogs are complete. A further language may lack texts; each missing text falls back to
// English, and every text keeps the language it is written in, so that plurals and numbers of
// an English fallback are formatted with English rules. `missingTexts` lists what falls back,
// for the content tests to report; missing texts are not errors.

import type { LevelCatalog, LevelOption, PartialLevelCatalog, UiCatalog } from "./catalog-schema";
import type { Content, LevelCatalogs, UiCatalogs } from "./content-loader";
import type { CatalogText } from "./message";

/** A row of an explanation's option table: the option (a literal command) and its description. */
export interface LevelTextOption {
  readonly option: string;
  readonly description: CatalogText;
}

/** All texts of a level in one language, with English where the language lacks a text. */
export interface LevelTexts {
  readonly title: CatalogText;
  readonly ticket: CatalogText;
  readonly hints: readonly [tip: CatalogText, concreteTip: CatalogText, solution: CatalogText];
  readonly explanation: {
    readonly text: CatalogText;
    readonly options: readonly LevelTextOption[];
    /** A command to try; literal. */
    readonly example?: string;
  };
  /** Descriptions of the extra goals by their ID. */
  readonly extraGoals: ReadonlyMap<string, CatalogText>;
  /**
   * Every other text by its key: tips, step messages and prose file contents (use the source
   * of a file content as it is).
   */
  readonly texts: ReadonlyMap<string, CatalogText>;
}

/** The UI texts in one language by their dotted keys. */
export type UiTexts = ReadonlyMap<string, CatalogText>;

/** The texts of a further language that fall back to English, for one catalog. */
export interface MissingTexts {
  readonly language: string;
  /** The level's ID, or unset for the UI catalog. */
  readonly level?: string;
  /** Whether the whole catalog file is missing. */
  readonly catalogMissing: boolean;
  /** The missing texts by their path in the catalog, for example `hints` or `menu.new-game`. */
  readonly keys: readonly string[];
}

/** The texts of a level in a language; unknown languages and missing texts give English. */
export function levelTexts(catalogs: LevelCatalogs, language: string): LevelTexts {
  const { en } = catalogs;
  if (language === "de") {
    return completeLevelTexts(catalogs.de, "de");
  }
  const partial = language === "en" ? undefined : catalogs.extra.get(language);
  if (partial === undefined) {
    return completeLevelTexts(en, "en");
  }
  const text = (source: string | undefined, fallback: string): CatalogText =>
    source === undefined ? { language: "en", source: fallback } : { language, source };
  const [tip, concreteTip, solution] = partial.hints ?? en.hints;
  const hintLanguage = partial.hints === undefined ? "en" : language;
  const options = partial.explanation?.options;
  const example = partial.explanation?.example ?? en.explanation.example;
  return {
    title: text(partial.title, en.title),
    ticket: text(partial.ticket, en.ticket),
    hints: [
      { language: hintLanguage, source: tip },
      { language: hintLanguage, source: concreteTip },
      { language: hintLanguage, source: solution },
    ],
    explanation: {
      text: text(partial.explanation?.text, en.explanation.text),
      options:
        options === undefined
          ? textOptions(en.explanation.options, "en")
          : textOptions(options, language),
      ...(example === undefined ? {} : { example }),
    },
    extraGoals: mergeTexts(en.extraGoals, partial.extraGoals, language),
    texts: mergeTexts(en.texts, partial.texts, language),
  };
}

/** The UI texts in a language; unknown languages and missing texts give English. */
export function uiTexts(catalogs: UiCatalogs, language: string): UiTexts {
  if (language === "de") {
    return ownTexts(catalogs.de, "de");
  }
  const partial = language === "en" ? undefined : catalogs.extra.get(language);
  return mergeTexts(catalogs.en, partial ?? new Map(), language);
}

/**
 * The texts that fall back to English: for every further language that any catalog has, the
 * UI catalog and every level catalog, in chapter order. Catalogs without missing texts are
 * left out.
 */
export function missingTexts(content: Content): MissingTexts[] {
  const languages = new Set<string>(content.uiCatalogs.extra.keys());
  for (const catalogs of content.levelCatalogs.values()) {
    for (const language of catalogs.extra.keys()) {
      languages.add(language);
    }
  }
  const result: MissingTexts[] = [];
  for (const language of [...languages].sort()) {
    const ui = content.uiCatalogs.extra.get(language);
    const uiKeys = [...content.uiCatalogs.en.keys()].filter((key) => !ui?.has(key));
    if (uiKeys.length > 0) {
      result.push({ language, catalogMissing: ui === undefined, keys: uiKeys });
    }
    for (const [level, catalogs] of content.levelCatalogs) {
      const partial = catalogs.extra.get(language);
      const keys = missingLevelKeys(catalogs.en, partial);
      if (keys.length > 0) {
        result.push({ language, level, catalogMissing: partial === undefined, keys });
      }
    }
  }
  return result;
}

/** The paths of the English texts that a partial catalog lacks. */
function missingLevelKeys(en: LevelCatalog, partial: PartialLevelCatalog | undefined): string[] {
  const keys: string[] = [];
  const check = (key: string, has: boolean): void => {
    if (!has) {
      keys.push(key);
    }
  };
  check("title", partial?.title !== undefined);
  check("ticket", partial?.ticket !== undefined);
  check("hints", partial?.hints !== undefined);
  check("explanation.text", partial?.explanation?.text !== undefined);
  if (en.explanation.options.length > 0) {
    check("explanation.options", partial?.explanation?.options !== undefined);
  }
  if (en.explanation.example !== undefined) {
    check("explanation.example", partial?.explanation?.example !== undefined);
  }
  for (const id of en.extraGoals.keys()) {
    check(`extra_goals.${id}`, partial?.extraGoals.has(id) === true);
  }
  for (const key of en.texts.keys()) {
    check(key, partial?.texts.has(key) === true);
  }
  return keys;
}

/** The texts of a complete catalog, all in its language. */
function completeLevelTexts(catalog: LevelCatalog, language: string): LevelTexts {
  const text = (source: string): CatalogText => ({ language, source });
  const [tip, concreteTip, solution] = catalog.hints;
  const { example } = catalog.explanation;
  return {
    title: text(catalog.title),
    ticket: text(catalog.ticket),
    hints: [text(tip), text(concreteTip), text(solution)],
    explanation: {
      text: text(catalog.explanation.text),
      options: textOptions(catalog.explanation.options, language),
      ...(example === undefined ? {} : { example }),
    },
    extraGoals: ownTexts(catalog.extraGoals, language),
    texts: ownTexts(catalog.texts, language),
  };
}

function textOptions(options: readonly LevelOption[], language: string): LevelTextOption[] {
  return options.map(([option, description]) => ({
    option,
    description: { language, source: description },
  }));
}

/** The texts of a complete catalog, in its language. */
function ownTexts(texts: ReadonlyMap<string, string>, language: string): Map<string, CatalogText> {
  return new Map([...texts].map(([key, source]) => [key, { language, source }]));
}

/**
 * The English texts, each replaced by the text of `language` where it has one. Keys that
 * English lacks are left out: English decides which texts exist.
 */
function mergeTexts(
  english: UiCatalog,
  translated: ReadonlyMap<string, string>,
  language: string,
): Map<string, CatalogText> {
  const result = new Map<string, CatalogText>();
  for (const [key, source] of english) {
    const own = translated.get(key);
    result.set(key, own === undefined ? { language: "en", source } : { language, source: own });
  }
  return result;
}
