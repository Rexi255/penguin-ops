# 0071. Translation catalog files and their loading

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M2.3 asks for translation catalogs, ICU formatting, text markup and an English fallback.
It is split into four packages: M2.3a catalog files and their loading, M2.3b ICU formatting,
M2.3c text markup and M2.3d the fallback for further languages. ADR 0012 placed the catalogs
next to each level (`de.yaml`, `en.yaml`) and in `content/ui/<lang>.yaml`, made German and
English mandatory and complete, and allowed further languages to be incomplete with an English
fallback. `docs/LEVEL-AUTHORING.md` already described the keys of a level catalog (`title`,
`ticket`, three `hints`, `explanation`, `extra_goals.<id>` and free text keys), but no schema
checked them. ADR 0070 loads the chapters and level files from `{ file, text }` pairs and asked
for catalogs as further named inputs.

## Decision

- **Level catalog schema** (`src/catalog-schema.ts`), for English and German:
  - `title` and `ticket`: texts.
  - `hints`: a list of exactly three texts (tip, concrete tip, solution).
  - `explanation`: `text` (required), `options` (optional list of `[option, description]`
    pairs, default empty) and `example` (optional); other fields are errors.
  - `extra_goals`: optional map from extra goal IDs (kebab-case) to their descriptions.
  - Every other key is a free text (tips, step messages, prose file contents). It must be a
    text key as in `level.yaml`: kebab-case, starting with a letter.
  - A text is a string that is not empty or only whitespace.
  - There is no `format` field: a catalog belongs to its level, whose format version covers
    it.
- **Partial level catalogs** for further languages use the same rules, but every field is
  optional, also `explanation.text`. Hints, if given, are still exactly three, and options are
  still pairs.
- **UI catalog schema**: a map of texts and groups of texts, nested to any depth. Keys are text
  keys (kebab-case, starting with a letter); a group is never empty. The result holds every
  text by its dotted key, for example `menu.new-game`. English, German and further languages
  use the same schema.
- **Results:** a level catalog becomes `LevelCatalog` with `extraGoals` and `texts` as maps; a
  UI catalog becomes a map. `Catalogs<Complete, Partial>` holds `en`, `de` and `extra`, a map
  of the further languages by code.
- **Language codes:** a catalog file is named after its language: a lowercase ISO 639 code with
  two or three letters, optionally followed by a hyphen and a lowercase two-letter region
  (`de`, `en`, `pt-br`). Lowercase keeps the file names kebab-case.
- **Loading:** `loadContent` takes two more inputs, `levelCatalogs` (every other `.yaml` file
  in a level folder) and `uiCatalogs` (every `.yaml` file in `content/ui/`), and returns
  `levelCatalogs` (by level ID, in chapter order) and `uiCatalogs`. It reports, at the start of
  the file:
  - a level catalog outside a level folder, a UI catalog outside a `ui` folder;
  - a file name that is not a language code (for example `notes.yaml`);
  - a level catalog whose folder has no `level.yaml` (a level file that fails its schema still
    counts as existing);
  - a catalog given twice;
  - a missing English or German catalog, reported at the path where the file belongs
    (`content/levels/<id>/de.yaml`, or `ui/de.yaml` next to the chapters file). A mandatory
    catalog that exists but fails its schema is reported only with its own problems.
- **Not checked here:** whether the English and German catalogs hold the same keys and exactly
  the keys that `level.yaml` uses (ROADMAP M2.4), whether texts are valid ICU MessageFormat
  (M2.3b) and valid markup (M2.3c), and which keys the UI needs (with the UI in M3).
- **Key checks next to value problems:** the checks of free keys, extra goal IDs and UI keys run
  even when values inside the same map have problems, so that more problems are reported in
  one run. zod still skips them after a value of the wrong type.

## Alternatives considered

- **Flat catalogs with keys such as `hints.0` and `explanation.options.1`:** uniform and easy to
  merge for the fallback, but the format is harder to write and to read, and the UI would have
  to rebuild the structure.
- **One schema for all languages with every field optional:** simpler, but then a missing title
  in the German catalog would only be found by the content tests, far from the file. Checking
  the mandatory languages with the complete schema reports it at once.
- **A `format` field in every catalog:** translators would have to keep it in sync with the
  level file for no gain; a format change of the level is migrated with its catalogs.
- **A fixed list of supported languages:** would need a code change for every new translation;
  the file name pattern catches typos such as `DE.yaml` or `notes.yaml` and keeps languages
  open.
- **Ignoring unknown files in a level folder:** hides typos; passing every other `.yaml` file
  as a catalog reports them (as ADR 0070 argued for named inputs).
- **Reporting a missing catalog at the level's `id`:** points at a file that is fine; naming the
  missing file tells the author what to create.

## Consequences

- Callers of `loadContent` (content tests in M2.4, the Electron main process) also read the
  catalogs and the UI folder. The repository has no `content/ui/` folder yet; it is created
  with the first UI texts.
- M2.4 compares the keys of the English and German catalogs with each other and with the keys
  that `level.yaml` uses; M2.3d builds complete catalogs for further languages from `extra` and
  English.
- There is no JSON Schema for catalogs yet (ROADMAP ideas, like the chapters file).
