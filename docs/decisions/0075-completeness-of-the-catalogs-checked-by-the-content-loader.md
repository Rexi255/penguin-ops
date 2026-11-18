# 0075. Completeness of the catalogs checked by the content loader

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0012 requires the English and German catalogs to be complete and CI to fail otherwise.
ADR 0071 left the comparison of the catalogs with each other and with the text keys of
`level.yaml` to ROADMAP M2.4 ("content tests: schema, German/English completeness, reference
solutions ..."). ADR 0072 made texts that `level.yaml` uses as file contents literal, which only
works if a text key is not also used as a message, and allowed placeholders in UI texts, which
only work if every language uses the same ones.

The reference solutions of M2.4 need the level session of M2.5 (building the world, running
commands, evaluating goals and tips), and `content/` holds no levels before M2.6. The
completeness checks need neither.

## Decision

- **Checked by `loadContent`,** not by a separate test step, so that the game, the content
  tests and the developer mode all reject incomplete content with file, line and column. The
  checks run for every level whose `level.yaml` is valid, against its valid catalogs.
- **Level catalogs:**
  - English and German hold every text key that `level.yaml` uses (`{ text: <key> }` in
    `start.files`, `say` of tips and steps) and a description `extra_goals.<id>` of every
    extra goal. A missing one is reported at the start of the catalog.
  - No catalog, in any language, holds a free text that `level.yaml` does not use or an extra
    goal that it does not have. These are reported at the key; they are typos or leftovers.
  - A text key is used either for file contents or as a message; a `say` that names a file
    text is reported in `level.yaml`.
  - The commands of the explanation are technical and always English (ADR 0012): German has
    the same options (in the same order) and the same example as English. A further language
    may leave them out (they fall back to English) or give no options (ADR 0074); options or an
    example that it gives must be those of English.
- **UI catalogs:** German has every key of English; German and further languages have no key
  that English lacks. Further languages may lack keys (ADR 0074).
- **Placeholders:** a UI text uses the same placeholders as its English text, each in the same
  way (text, number for `number` and `plural`, select). Level texts have none (ADR 0072).
- **English is the reference:** a key that German has and English lacks is reported in the
  German catalog as unknown, not as missing in English.
- **ROADMAP M2.4 is split:** M2.4a is these checks. The content test that reads the
  repository's `content/` folder and plays the reference solutions in every language and with
  two user names follows once the level session exists (M2.5).

## Alternatives considered

- **Only a content test, not the loader:** CI would catch the problems, but the developer mode
  and the app would load incomplete content and fail later when a text is missing.
- **Reporting missing texts at the key in `level.yaml` that uses them:** points at a file that
  is correct; the catalog is where the author has to add the text.
- **Translated commands in the explanation:** commands, options and paths are English in the
  simulated world, so a different command in German is always a mistake.
- **Comparing placeholder names only:** a German `{count}` without `plural` for an English
  plural would format, but a select or number used differently can throw at run time.

## Consequences

- Adding a tip to `level.yaml` without its texts fails `npm run check` at once, with the
  catalog file named.
- The content test over `content/` (M2.4b) only has to run `loadContent`, print `missingTexts`
  and play the reference solutions.
- Which UI keys the UI actually uses is still checked with the UI (M3).
