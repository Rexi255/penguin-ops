# Status

_Last updated: 2026-11-18_

## Recently completed

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
- M1.10b `cp` (coreutils 9.7): files and `-r` like `copy_internal` (target directory, same
  file, overwrite checks, new files with the source's bits minus the umask, directories filled
  with owner rights and fixed afterwards, "into itself" and repeated operands by canonical
  paths), `-f`, `-v`, `-t`, `-T`. New `changeMode`, `createMode`, mkdir modes and
  `file-names.ts` (ADR 0062).
## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M1.11b: history navigation API.
2. ROADMAP M1.12: rule engine.
3. Check the M1 "Done when" criteria (engine coverage, no DOM or Node APIs in the engine).

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
  and its NEWS. Tab completion was measured on bash 5.2.21, not on Debian 13's 5.2.37
  (ADR 0065). M6 verifies them.
