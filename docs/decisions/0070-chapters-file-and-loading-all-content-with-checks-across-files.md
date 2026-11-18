# 0070. Chapters file and loading all content with checks across files

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M2.2b asks for a schema of `content/chapters.yaml` and for loading all levels from a
list of files, with checks across files: the folder name is the level ID, and every level is
in exactly one chapter. ADR 0069 built `loadYaml` for one file with located problems; a single
file's schema cannot see other files. The content package stays pure (ADR 0006), so it cannot
list folders itself. The curriculum (`docs/CURRICULUM.md`) orders the levels in chapters;
chapter titles and story hooks are player-facing text and belong in the translation catalogs
(ADR 0012, ROADMAP M2.3).

## Decision

- **`content/chapters.yaml`** has the fields `format` (version 1, like level files) and
  `chapters`, a list in game order. Each chapter has an `id` (kebab-case, stable, used by save
  files and catalogs) and `levels`, the level IDs in the order the game offers them. Nothing
  else: titles live in the catalogs, other chapter data waits until a feature needs it. Unknown
  fields are errors. There is at least one chapter, each chapter has at least one level, and
  chapter IDs are unique (`src/chapters-schema.ts`).
- **`loadContent({ chapters, levels })`** in `src/content-loader.ts` takes the chapters file
  and every level file as `{ file, text }` and returns the chapters and a map of all levels by
  ID in chapter order, or all problems of all files together, sorted as in ADR 0069. The
  caller finds and reads the files.
- **Level paths:** a level file must be `.../levels/<folder>/level.yaml` with forward slashes.
  Only the last three path parts count, so the same loader works for the repository
  (`content/levels/...`) and for the packaged app's resources folder. Another name or place is
  a problem at the file's start; a folder given twice is a problem.
- **Checks across files**, each located where the author has to change something:
  - the level's `id` differs from its folder name: at the `id` in the level file;
  - a chapter lists a level without a file: at that list item in `chapters.yaml`;
  - a level is listed again (in another chapter or the same one): at each repetition, naming
    the chapter of the first listing;
  - a level is in no chapter: at its `id`, or at the file's start if the YAML could not be
    read.
- **Broken files and checks across files:** a level file that fails its schema still counts as
  existing under its folder name, so a chapter that lists it gets no extra "no level"
  problem. While `chapters.yaml` itself fails, the chapters are not checked against the levels,
  because those problems would only repeat the first one.
- **`readYaml`** in `src/level-loader.ts` returns the parsed YAML source next to the result,
  also when the schema fails, so that checks across files can locate their problems.
  `loadYaml` keeps its behaviour.

## Alternatives considered

- **A flat list of all content files, sorted by the loader:** would let the loader see folders
  without `level.yaml`, but it must then either report or silently ignore files it does not
  read yet (catalogs until M2.3, worlds until M2.5). Silent ignoring hides typos such as
  `levle.yaml`. Named inputs grow with each content kind instead.
- **Chapter order taken from folder names or a field in each level:** spreads the order over
  many files and makes reordering a multi-file change; one file shows the whole curriculum.
- **Chapter titles in `chapters.yaml`:** they are player-facing text and must be translated.
- **Requiring the full `content/levels/` prefix:** ties the loader to the repository layout;
  the packaged app keeps content under another folder.
- **Reporting a level in two chapters at both places:** the first listing is usually right;
  one problem per repetition is shorter and points to the line to delete.

## Consequences

- Content tests (M2.4) and the Electron main process find the files, read them and call
  `loadContent`; on Windows they must turn backslashes into forward slashes.
- `content/chapters.yaml` itself is created with the first levels (M2.6).
- Catalogs (M2.3) and worlds (M2.5) are added as further named inputs with their own checks.
- There is no JSON Schema for `chapters.yaml` yet; the file is small (ROADMAP ideas).
