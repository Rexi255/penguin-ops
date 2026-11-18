# Status

_Last updated: 2026-11-18_

## Recently completed

- M3.0b-1 Visual tone: `PRODUCT.md` from the owner's interview and a seed `DESIGN.md` in the
  repository root; the owner chose the visual world "Label Tape & Patch Cable" on impeccable's
  decision page (ADR 0081); direction contract in `apps/ui/.impeccable/surfaces/`. impeccable
  finds the root files from `apps/ui`.
- M3.0a impeccable design skill: byte-for-byte copy of release `cli-v4.9.1` in
  `.claude/skills/impeccable/` without hook and subagents, telemetry off in
  `.impeccable/config.json`, `.gitignore` block, guarded by `scripts/impeccable-setup.test.ts`;
  verified on Windows (ADR 0080). Newer releases 4.9.2 and 4.10.0 ship without engine checksums.
- M2.8 `/new-level` skill (`.claude/skills/new-level/`): clarify chapter, kind, commands and
  ID, design the data and texts from the closest existing level, register the level, prove it
  with the content tests and get the owner's OK of the texts. M2 is complete.
- M2.7 Developer mode API (`developer-mode.ts`): `levelSetup` (also used by the content
  test), `startAtStep`, `autoPlay` of a reference solution and `inspectRules` with the state of
  every rule, step, tip and extra goal; unknown levels, steps and solutions throw a
  `DeveloperModeError` (ADR 0079). The UI follows in M3.16.

## In progress

- Nothing.

## Next 3 steps

1. ROADMAP M3.0b-2: design tokens from `DESIGN.md`, WCAG AA contrast test, regenerate
   `DESIGN.md` with `/impeccable document`.
2. ROADMAP M3.0c: styleguide page.
3. ROADMAP M3.0d: typography.

## Blockers and open questions

- impeccable is not yet verified in a cloud session (engine download from GitHub releases,
  writable `~/.impeccable/`); check it in the next cloud session (ADR 0039, ADR 0080).
- The texts of the five prototype levels and the office world's host name `itdesk` were
  written as test content without the owner's review (the prototype's source is not in the
  repository, so levels 2 to 5 follow the titles in `docs/CURRICULUM.md`); the story workshop
  (M4) replaces them.
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
