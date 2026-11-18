# Status

_Last updated: 2026-11-18_

## Recently completed

- M1.11b History navigation (`history-navigation.ts`): `previousHistory`/`nextHistory` like
  readline's Up and Down (saved new line, bell at the oldest entry, cursor at the end), edits
  of history entries kept until the line is run (`HistoryEntry.original`, `*` in `history`),
  `acceptHistoryLine` for Enter (ADR 0066). M1.11 is complete.
- M1.11a Tab completion (`completion.ts`): `complete` gives the new line, cursor, bell and the
  matches of the second Tab like bash 5.2 with readline 8.2, measured on a real bash: variables,
  `~user`, command names (also after `;`, `|`, assignments), patterns with one match, file
  names with bash's backslash or quote style; `formatCompletionList` and `completionQuestion`
  for readline's list (ADR 0065).
- M1.10d `grep` (3.11): basic, extended and fixed patterns (`grep-pattern.ts` translates GNU
  patterns into JavaScript with regcomp's errors and dfa's warnings), `-e`, `-i`, `-v`, `-w`,
  `-x`, `-n`, `-c`, `-l`, `-L`, `-q`, `-s`, `-H`, `-h`, `-r`/`-R`, binary files, "input file is
  also the output", exit statuses 0/1/2 (ADR 0064). M1.10 is complete.
- M1.10c `mv` (coreutils 9.7): rename first without replacing, then the target directory;
  move-mode checks of `copy_internal` (same file, directory over file, just-created
  destinations, repeated directories), the errors "subdirectory of itself", "cannot overwrite"
  and "cannot move", `-f`, `-v`, `-t`, `-T`, `--strip-trailing-slashes`; the question before a
  write-protected destination stops with a notice. New `fs-rename.ts` (ADR 0063).

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.12: rule engine.
2. Check the M1 "Done when" criteria (engine coverage, no DOM or Node APIs in the engine).
3. ROADMAP M2.1: the first work package of the level system.

## Blockers and open questions

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
