# 0074. English fallback per text that keeps the language of each text

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0012 allows further languages besides English and German to be incomplete: missing texts
fall back to English, and CI only reports them. ADR 0071 loads the catalogs of further
languages with a partial schema into `Catalogs.extra`. ROADMAP M2.3d asks for the fallback and
the report. Open were the granularity of the fallback, how the game formats an English text
inside a game in another language, and in which form the missing texts are reported.

## Decision

- **Fallback per text:** `levelTexts(catalogs, language)` and `uiTexts(catalogs, language)`
  return every text of a level or of the UI in a language. Each text that the language lacks is
  taken from English on its own: `title`, `ticket`, `explanation.text`, the example, each extra
  goal description, each free text and each UI text. The three hints and the option table are
  taken as a whole, because they belong together; a language that gives `options: []` has
  chosen no options.
- **English decides which texts exist:** keys that a further language has and English lacks are
  left out (and reported as unknown keys by the completeness checks of M2.4).
- **Each text keeps its language:** the result holds `CatalogText` values (`{ language,
  source }`), so an English fallback in a Polish game is formatted with English plural rules
  and numbers, and `formatText` needs no separate language argument.
- **Languages:** `en` and `de` give their complete catalogs. Any other code gives the further
  language where it exists and English for every missing text; a code without any catalog
  gives English. There is no fallback from a region to its language (`pt-br` to `pt`); the
  choice of the game's language belongs to the settings (ADR 0013).
- **Report:** `missingTexts(content)` lists, for every further language that any catalog has,
  the UI catalog and every level catalog (in chapter order) with the paths of the missing texts
  (`hints`, `explanation.text`, `extra_goals.fast`, `menu.new-game`) and whether the whole file
  is missing. Missing options and examples are reported only when English has them. Missing
  texts are not problems of `loadContent`; the content tests (M2.4) print the report.

## Alternatives considered

- **Fallback per catalog (a level is either translated or English):** simpler, but a
  translation with one missing hint would show the whole level in English.
- **Fallback per single hint and option row:** hints build on each other and options form a
  table; mixing languages inside them reads worse than one block in English.
- **Formatting a fallback text in the game's language:** plural categories of English texts
  would not match the rules of, for example, Polish, and numbers would mix formats.
- **Region fallback (`pt-br` to `pt`):** useful only once two variants of a language exist; it
  can be added then.
- **Missing texts as warnings in `loadContent`'s result:** would widen the result type for
  information that only the content tests and translators need; a function over the loaded
  content keeps loading simple.

## Consequences

- The UI (M3) asks for `levelTexts` and `uiTexts` in the player's language and formats with
  `formatText`; it never reads the catalogs directly.
- Prose file contents fall back too; the level session (M2.5) uses the source of the text as
  the file content.
- Translators get a list of what is missing per language; CI stays green while a translation is
  incomplete.
