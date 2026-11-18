// The history list of an interactive bash (ADR 0057), following bash 5.2's `bashhist.c`, the
// `HISTSIZE` and `HISTCONTROL` handlers of `variables.c` and readline 8.2's `history.c`, as
// bash 5.2 bundles them. Each session keeps its own list; the history file (`HISTFILE`) is not
// simulated, so a new session starts with an empty list.

import { legalNumber, toCInt } from "./bash-number";
import type { Session } from "./session";

/** The history list of one shell. */
export interface History {
  /** The entries, oldest first. */
  readonly entries: readonly string[];
  /**
   * The number that `history` shows for the first entry, readline's `history_base`. It starts at
   * 1 and grows when old entries make room for new ones.
   */
  readonly base: number;
  /**
   * The most entries the list keeps ("stifled" in readline's words), or `undefined` for no
   * limit. Bash sets it from `HISTSIZE` (`applyHistorySize`).
   */
  readonly limit: number | undefined;
}

/** A list without entries and without a limit, as readline starts. */
export const EMPTY_HISTORY: History = { entries: [], base: 1, limit: undefined };

/** What `HISTCONTROL` asks for, bash's `history_control` flags. */
export interface HistoryControl {
  /** `ignorespace`: lines starting with a space are not saved. */
  readonly ignoreSpace: boolean;
  /** `ignoredups`: a line equal to the newest entry is not saved. */
  readonly ignoreDups: boolean;
  /** `erasedups`: older entries equal to a saved line are removed. */
  readonly eraseDups: boolean;
}

/**
 * Reads the value of `HISTCONTROL` like `sv_history_control`: a colon-separated list of
 * `ignorespace`, `ignoredups`, `ignoreboth` (both of them) and `erasedups`. Other words and an
 * unset or empty variable ask for nothing.
 */
export function historyControl(value: string | undefined): HistoryControl {
  const words = new Set((value ?? "").split(":"));
  const both = words.has("ignoreboth");
  return {
    ignoreSpace: both || words.has("ignorespace"),
    ignoreDups: both || words.has("ignoredups"),
    eraseDups: words.has("erasedups"),
  };
}

/**
 * Adds `line` as the newest entry, like readline's `add_history`: when the list is full, the
 * oldest entry makes room and the base grows by one; a list limited to 0 entries saves nothing.
 */
export function addHistoryEntry(history: History, line: string): History {
  const { entries, base, limit } = history;
  if (limit !== undefined && entries.length >= limit) {
    if (entries.length === 0) {
      return history;
    }
    return { entries: [...entries.slice(1), line], base: base + 1, limit };
  }
  return { entries: [...entries, line], base, limit };
}

/**
 * Limits the list to `max` entries, like readline 8.2's `stifle_history`: if there are more, the
 * oldest ones are removed, and the base becomes the number of removed entries. That is what
 * readline does, although it makes the remaining entries show smaller numbers than before.
 */
export function stifleHistory(history: History, max: number): History {
  const limit = Math.max(max, 0);
  const removed = history.entries.length - limit;
  if (removed <= 0) {
    return { ...history, limit };
  }
  return { entries: history.entries.slice(removed), base: removed, limit };
}

/**
 * Applies a new value of `HISTSIZE` like bash's `sv_histsize`: an unset or empty value or a
 * negative number removes the limit; a number from 0 on (as a C `int`) limits the list with
 * `stifleHistory`; any other value changes nothing.
 */
export function applyHistorySize(history: History, value: string | undefined): History {
  if (value === undefined || value === "") {
    return { ...history, limit: undefined };
  }
  const number = legalNumber(value);
  if (number === undefined) {
    return history;
  }
  const max = toCInt(number);
  return max < 0 ? { ...history, limit: undefined } : stifleHistory(history, max);
}

/** Removes all entries, like readline's `clear_history`; the base goes back to 1. */
export function clearHistory(history: History): History {
  return { entries: [], base: 1, limit: history.limit };
}

/**
 * Removes the entries from index `first` to index `last` (both counted from 0 and included),
 * like readline's `remove_history_range`; the base stays. Returns `undefined`, as readline does,
 * if an index is outside the list or `first` comes after `last`.
 */
export function removeHistoryRange(
  history: History,
  first: number,
  last: number,
): History | undefined {
  const length = history.entries.length;
  if (first < 0 || first >= length || last < 0 || last >= length || first > last) {
    return undefined;
  }
  const entries = [...history.entries.slice(0, first), ...history.entries.slice(last + 1)];
  return { ...history, entries };
}

/**
 * Saves the input the player entered in the session's history, as bash does with each line it
 * reads before it runs it (`maybe_add_history` and `check_add_history`). The game calls it with
 * every input, also one that does not parse or that stops with a notice.
 *
 * - An empty input is not saved.
 * - With `ignorespace` in `HISTCONTROL`, an input starting with a space is not saved (a tab
 *   does not count).
 * - With `ignoredups`, an input equal to the newest entry is not saved.
 * - With `erasedups`, all older entries equal to the input are removed before it is saved.
 *
 * `HISTIGNORE` is not simulated. An input of several lines is saved as one entry with its line
 * breaks.
 */
export function recordHistory(session: Session, input: string): Session {
  if (input === "") {
    return session;
  }
  const control = historyControl(session.variables.get("HISTCONTROL"));
  const history = session.history;
  if (control.ignoreSpace && input.startsWith(" ")) {
    return session;
  }
  if (control.ignoreDups && history.entries.at(-1) === input) {
    return session;
  }
  const kept: History = control.eraseDups
    ? { ...history, entries: history.entries.filter((entry) => entry !== input) }
    : history;
  return { ...session, history: addHistoryEntry(kept, input) };
}
