# Status

_Last updated: 2026-11-18_

## Recently completed

- M2.3c Text markup (`markup.ts`): `formatText` and `parseMarkup` turn a formatted message into
  `RichText` (paragraphs with kept line breaks, `- ` lists, bold on one line, code); values are
  never markup and nothing is HTML. `checkText` adds markup checks to the ICU checks of
  `loadContent`: unclosed or empty bold, bold around an option with a line break, empty list
  items (ADR 0073).
- M2.3b ICU MessageFormat (`message.ts`, `catalog-texts.ts`): `intl-messageformat` 12.1.4 and its
  parser; code spans are never ICU and apostrophes are always literal; placeholders are camelCase
  (`number`, `plural`, `selectordinal`, `select`, no dates), plural options must exist in the
  language; level texts have no placeholders yet. `loadContent` checks every formatted catalog
  text and reports problems at the spot inside the text; `formatMessage` returns catalog text,
  values (never markup) and code as separate parts (ADR 0072).
- M2.3a Catalog files (`catalog-schema.ts`, `content-loader.ts`): level catalogs need `title`,
  `ticket`, exactly three `hints` and `explanation.text` in English and German, further
  languages may lack any text; free keys are kebab-case text keys; UI catalogs are nested groups
  flattened to dotted keys. `loadContent` also reads `levelCatalogs` and `uiCatalogs` and reports
  misnamed files, catalogs without a level, duplicates and missing `en.yaml`/`de.yaml` (ADR 0071).
- M2.2b Chapters file and loading all content (`chapters-schema.ts`, `content-loader.ts`):
  `content/chapters.yaml` holds `format: 1` and chapters with an ID and their level IDs in
  order; `loadContent({ chapters, levels })` reads it and every `level.yaml` from
  `{ file, text }` and checks across files (folder name is the level ID, listed levels exist,
  every level in exactly one chapter), reporting all problems together (ADR 0070). M2.2 is
  complete.
- M2.2a Loading one YAML file from its text (`level-loader.ts`, `yaml-source.ts`,
  `schema-problems.ts`, `content-problem.ts`): `loadLevel(file, text)` reads YAML 1.2 with the
  `yaml` library and reports problems as `file:line:column: path: message`; map entries are
  located at their key, list items at the item; unknown and missing fields and unions get
  readable messages; parser warnings, empty files and aliases without anchors are problems
  (ADR 0069).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M2.3d: English fallback for further languages.
2. ROADMAP M2.4: content tests.
3. ROADMAP M2.5: gameplay core (level session).

## Blockers and open questions

- The format and loading of `content/worlds/` are defined with the level session (M2.5), where a
  level first needs a world (confirmed by the owner).
- Linux is verified only by CI; the owner plays on Windows and has no Linux machine, so no
  manual Linux check is planned. CI builds the AppImage but starts the unpacked app, so the
  M5 criterion "the AppImage runs on Linux" needs CI to start the AppImage itself (ROADMAP
  ideas) before v0.1.
- The logo colours are provisional until M3.0f-2 aligns them with the design tokens.
- Steam release is assumed to be "maybe later" (ADR 0002); confirm with the owner when it
  becomes relevant.
- Some details of `ls`, `clear`, `history`, `cat`, `head`, `tail`, `touch`, `rm`, `cp`, `mv` and
  `grep` could not be checked against a real Debian 13 (tests marked `@differential`, ADR 0054
  to ADR 0064); grep 3.11's own source could not be fetched, so grep follows an earlier 3.x
  and its NEWS. Tab completion and history navigation were measured on bash 5.2.21, not on
  Debian 13's 5.2.37 (ADR 0065, ADR 0066). M6 verifies them.
