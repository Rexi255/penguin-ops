# 0038. Create decision records with the adr skill

- Status: Accepted
- Date: 2026-11-17
- Supersedes: –

## Context

ADR 0001 requires a numbered record for every significant decision and says that the `/adr`
skill (ROADMAP M0.11) makes writing one cheaper. By hand, three steps are easy to get wrong:
picking the next free number, deriving the kebab-case file name from the title, and updating
the status line of a superseded record without touching the rest of it. Records 0005, 0015,
0025, 0026, 0027 and 0029 show that partial supersedes are common, and that a status line
collects several of them over time.

A skill is a Markdown instruction for Claude and cannot be tested. The Definition of Done in
`CLAUDE.md` requires tests for new behaviour.

## Decision

- The mechanical part is a Node.js script in TypeScript, `npm run adr:new`
  (`scripts/new-adr.ts`, logic in `scripts/adr/`), tested with Vitest like the other scripts.
  Usage: `npm run adr:new -- "Title in sentence case"`, optionally followed by
  `--supersedes <number>` and `--partly "<number>:<scope>"`, both repeatable.
- The script creates `docs/decisions/NNNN-kebab-case-title.md` from `template.md` with the
  next number (one more than the highest; gaps are not reused), today's date, status
  `Proposed` and the `Supersedes` line. It never overwrites a file.
- Superseding: a completely superseded record gets `Superseded by [NNNN](file)`. A partly
  superseded record gets `Accepted; partly superseded by [NNNN](file) (scope)`; further
  partial supersedes are appended with `and`. The new record lists each superseded record,
  with `(only scope)` for a partial one. Only the status line of the old record changes,
  wrapped at 100 characters with an indent of two spaces.
- The script refuses, without writing anything: an empty or multi-line title, a title without
  letters or digits, an unknown record, a record listed twice, a record that is `Proposed` (it
  is edited instead) or already completely superseded, an empty scope, a file name in
  `docs/decisions/` that does not follow `NNNN-kebab-case-title.md`, and two files with the
  same number.
- The `/adr` skill (`.claude/skills/adr/SKILL.md`) runs the script and guides the writing part:
  finding related records, filling in the sections, setting the status to `Accepted` once the
  owner has decided, and the push rule for changed accepted records. Claude may invoke it on
  its own, because `CLAUDE.md` asks for a record for every important decision.

## Alternatives considered

- **Skill only, without a script:** no extra code, but the number, file name and status line
  would stay untested manual work, against the Definition of Done.
- **A ready-made ADR tool (for example adr-tools or log4brains):** brings its own file format
  and status conventions, needs bash or a new dependency, and does not know this project's
  partial supersedes.

## Consequences

- Creating a record is one command; the result has a correct number, file name and header.
- The script relies on the header format of `template.md` (`# ` heading, `- Status:`,
  `- Date:`, `- Supersedes:` lines). Changing the template needs a matching change of the
  script; its tests read the real template and records, so a mismatch fails `npm run check`.
- Wrapping of rewritten status lines is greedy at 100 characters and can differ slightly from
  hand-wrapped lines; the text stays the same.
