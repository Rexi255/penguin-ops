# 0066. History navigation with readline's kept edits of history entries

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.11b asks for the engine API behind the Up and Down keys of the terminal. The history
list itself exists since ADR 0057. Up and Down are readline's `previous-history` and
`next-history`; bash 5.2 on Debian 13 uses them with readline 8.2's defaults, in particular
`history-preserve-point` and `revert-all-at-newline` off.

The behaviour was measured on bash 5.2.21 with readline 8.2 through a pseudo terminal, like the
Tab completion of ADR 0065:

- Up from the new line saves the typed line; Down after the newest entry brings it back. The
  cursor always goes to the end of the line.
- Up at the oldest entry and Up with an empty history ring the bell; Down on the new line does
  nothing and rings no bell.
- An entry the player edits and leaves without running it keeps the edit: Up and Down show the
  edited line again, and `history` lists it with a `*` after the number
  (`    2* echo bX`). This is the effect of `revert-all-at-newline` being off.
- Running a line while it shows an edited entry gives that entry its original line back; the
  run line becomes a new entry. Edits of other entries stay.

## Decision

- **Edited entries.** A history entry is now a `HistoryEntry` with its `line` and, if the
  player edited it without running it, the `original` line (readline's undo list). New entries
  have no original. `history` lists an entry with an original as `%5d* %s` instead of
  `%5d  %s`; ADR 0057's format stays for all other entries. `recordHistory` compares the lines
  as the history shows them, with edits, like bash.
- **API.** The new `src/history-navigation.ts` exports `previousHistory` (Up) and `nextHistory`
  (Down). Both take the session, a `HistoryNavigation` (the index of the shown entry, or
  `undefined` for the new line, and the saved new line) and the input line as the player left
  it. They return the session (whose history keeps the edit of the entry that was left), the
  new navigation, the line to show, the cursor at its end and the bell. `acceptHistoryLine`
  gives an edited entry its original back when the player runs the line shown from it; the
  game calls it before `recordHistory`. A new input starts at `AT_NEW_LINE`.
- **What counts as an edit.** The engine sees lines, not keystrokes, so an entry counts as
  edited when the line the player leaves differs from the entry's line. readline counts any
  change of the undo list, so an edit that restores the same text is not marked there; once
  marked, an entry stays marked in both, also when edited back to its original text.
- **Not simulated:** readline's other history commands (`beginning-of-history`,
  `end-of-history`, Ctrl+R and the other searches, `history-search-backward`, `M-.`), numeric
  arguments, `history-preserve-point` and `revert-all-at-newline`.

## Alternatives considered

- **Revert all edits when a line is run (`revert-all-at-newline` on):** simpler, because the
  history list would keep plain strings. But it is not Debian 13's default, and players who
  edit a recalled line and then change their mind would see different lines on Up than in a
  real terminal.
- **Keep the edits only in the UI:** the edits would not reach `history` and `HISTCONTROL`,
  which read the history list in the engine, and the UI would duplicate readline's rules.

## Consequences

- The terminal of M3 keeps a `HistoryNavigation` between key presses, calls `previousHistory`
  and `nextHistory` on Up and Down, and calls `acceptHistoryLine` and `recordHistory` on Enter.
- Code that reads the history list reads `entry.line` instead of a string.
- Searching the history (Ctrl+R) is a candidate for a later work package (ROADMAP ideas).
