// Moving through the history with the arrow keys (ADR 0066), like readline 8.2's
// `previous-history` (Up) and `next-history` (Down) in bash 5.2 with readline's default settings
// (`history-preserve-point` and `revert-all-at-newline` off). The UI owns the keys and the
// input line; this module computes the line to show and keeps the player's edits of history
// entries in the session's history, as readline does.

import type { History, HistoryEntry } from "./history";
import type { Session } from "./session";

/**
 * Where the input line is in the history between two key presses, readline's history offset and
 * its saved line. A new input starts at `AT_NEW_LINE`.
 */
export interface HistoryNavigation {
  /** The index of the entry the input line shows, or `undefined` for the new line. */
  readonly index: number | undefined;
  /** The new line as the player left it for the history, to bring back with Down. */
  readonly savedLine: string;
}

/** The new line: not in the history, nothing saved. */
export const AT_NEW_LINE: HistoryNavigation = { index: undefined, savedLine: "" };

/** The result of a key press: the session, the navigation and the input line to show. */
export interface HistoryStep {
  /** The session; its history keeps the edit of the entry that was left. */
  readonly session: Session;
  readonly navigation: HistoryNavigation;
  readonly line: string;
  /** The cursor, at the end of the line like readline without `history-preserve-point`. */
  readonly cursor: number;
  /** Whether readline rings the bell: there is no older entry. */
  readonly bell: boolean;
}

/**
 * Up, readline's `previous-history`: shows the entry before the current one, with the cursor at
 * its end. Leaving the new line saves it for Down. Leaving an entry the player edited (its line
 * differs from `line`) saves the edit in the entry, which keeps its original for `history`'s
 * `*` and for `acceptHistoryLine`. Without an older entry, the bell rings and the line stays,
 * but the edit is saved all the same.
 *
 * Throws a RangeError if the navigation's index is not an entry of the session's history.
 */
export function previousHistory(
  session: Session,
  navigation: HistoryNavigation,
  line: string,
): HistoryStep {
  checkIndex(session.history, navigation);
  const history = saveEdit(session.history, navigation.index, line);
  const saved = { ...session, history };
  const target = (navigation.index ?? history.entries.length) - 1;
  const entry = history.entries[target];
  if (entry === undefined) {
    return { session: saved, navigation, line, cursor: line.length, bell: true };
  }
  const savedLine = navigation.index === undefined ? line : navigation.savedLine;
  return show(saved, { index: target, savedLine }, entry.line);
}

/**
 * Down, readline's `next-history`: shows the entry after the current one, or after the newest
 * entry the saved new line, with the cursor at the end. An edit of the entry that was left is
 * saved like with `previousHistory`. On the new line, Down changes nothing and rings no bell.
 *
 * Throws a RangeError if the navigation's index is not an entry of the session's history.
 */
export function nextHistory(
  session: Session,
  navigation: HistoryNavigation,
  line: string,
): HistoryStep {
  checkIndex(session.history, navigation);
  if (navigation.index === undefined) {
    return { session, navigation, line, cursor: line.length, bell: false };
  }
  const history = saveEdit(session.history, navigation.index, line);
  const saved = { ...session, history };
  const target = navigation.index + 1;
  const entry = history.entries[target];
  if (entry === undefined) {
    return show(saved, AT_NEW_LINE, navigation.savedLine);
  }
  return show(saved, { index: target, savedLine: navigation.savedLine }, entry.line);
}

/**
 * What readline does with the history when the player runs the input line (Enter): if the line
 * comes from an entry the player edited, that entry gets its original line back, and only the
 * new input will hold the edit (`recordHistory` saves it next). Edits of other entries stay.
 * The next input starts at `AT_NEW_LINE`.
 *
 * Throws a RangeError if the navigation's index is not an entry of the session's history.
 */
export function acceptHistoryLine(session: Session, navigation: HistoryNavigation): Session {
  checkIndex(session.history, navigation);
  const { index } = navigation;
  const entry = index === undefined ? undefined : session.history.entries[index];
  if (index === undefined || entry?.original === undefined) {
    return session;
  }
  return { ...session, history: replaceEntry(session.history, index, { line: entry.original }) };
}

function show(session: Session, navigation: HistoryNavigation, line: string): HistoryStep {
  return { session, navigation, line, cursor: line.length, bell: false };
}

/**
 * Saves `line` in the entry at `index` if it differs from the entry's line, like readline's
 * `rl_maybe_replace_line`. The entry keeps the line it was saved with as its original.
 */
function saveEdit(history: History, index: number | undefined, line: string): History {
  const entry = index === undefined ? undefined : history.entries[index];
  if (index === undefined || entry === undefined || entry.line === line) {
    return history;
  }
  return replaceEntry(history, index, { line, original: entry.original ?? entry.line });
}

function replaceEntry(history: History, index: number, entry: HistoryEntry): History {
  const entries = history.entries.map((old, at) => (at === index ? entry : old));
  return { ...history, entries };
}

function checkIndex(history: History, navigation: HistoryNavigation): void {
  const { index } = navigation;
  if (index === undefined) {
    return;
  }
  if (!Number.isInteger(index) || index < 0 || index >= history.entries.length) {
    throw new RangeError(`the history has no entry ${String(index)}`);
  }
}
