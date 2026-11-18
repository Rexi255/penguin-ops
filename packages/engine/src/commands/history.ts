// The bash builtin `history` (ADR 0057), following bash 5.2's `builtins/history.def`. Without
// options it lists the session's history with numbers; `-c` clears it and `-d` deletes one entry
// or a range of entries. The options that work with the history file (`-a`, `-n`, `-r`, `-w`)
// and `-p` and `-s` are not simulated.

import { legalNumber } from "../bash-number";
import { builtinError, defineBuiltin } from "../builtins";
import { clearHistory, type History, removeHistoryRange } from "../history";
import type { CommandResult } from "../interpreter";
import type { Session } from "../session";

/** The exit status of `history` after an error, `EXECUTION_FAILURE`. */
const FAILURE = 1;

/** What deleting entries with `-d` gives. */
type DeleteResult =
  | { readonly kind: "deleted"; readonly history: History }
  /** A position outside the list or not a number; `position` is the text bash names. */
  | { readonly kind: "out-of-range"; readonly position: string }
  /** A range whose start comes after its end: bash fails without a message. */
  | { readonly kind: "empty-range" };

export const history = defineBuiltin({
  name: "history",
  options: ["a", "c", "d", "n", "p", "r", "s", "w"],
  simulated: ["c", "d"],
  withArgument: ["d"],
  usage: "history [-c] [-d offset] [n] or history -anrw [filename] or history -ps arg [arg...]",
  run: ({ session, name, options, optionArguments, operands, stdout, stderr }) => {
    let current = session.history;
    /** The result with the history as changed so far. */
    const exit = (exitStatus: number): CommandResult =>
      current === session.history
        ? { exitStatus }
        : { exitStatus, session: { ...session, history: current } };
    const fail = (message: string): CommandResult => {
      stderr(builtinError(name, message));
      return exit(FAILURE);
    };

    // Like bash, `-c` clears first and lets operands add to the cleared list again.
    if (options.includes("c")) {
      current = clearHistory(current);
      if (operands.length === 0) {
        return exit(0);
      }
    }

    const deleteArgument = optionArguments.get("d");
    if (deleteArgument !== undefined) {
      const deleted = deleteEntries(current, deleteArgument);
      switch (deleted.kind) {
        case "deleted":
          current = deleted.history;
          return exit(0);
        case "out-of-range":
          return fail(`${deleted.position}: history position out of range`);
        case "empty-range":
          return exit(FAILURE);
      }
    }

    // `get_numeric_arg`: a list of operands means one entry unless it names a number, and the
    // word `--` before the number is skipped.
    let limit: bigint | undefined;
    if (operands.length > 0) {
      limit = 1n;
      const [first, ...more] = operands[0] === "--" ? operands.slice(1) : operands;
      if (first !== undefined) {
        const number = legalNumber(first);
        if (number === undefined) {
          return fail(`${first}: numeric argument required`);
        }
        if (more.length > 0) {
          stderr(builtinError(name, "too many arguments"));
          return discard(session, current);
        }
        limit = number < 0n ? -number : number;
      }
    }

    const count = current.entries.length;
    // As in `display_history`, a limit at least as long as the list shows it all; 0 shows nothing.
    const first = limit !== undefined && limit < BigInt(count) ? count - Number(limit) : 0;
    if (first < count && (session.variables.get("HISTTIMEFORMAT") ?? "") !== "") {
      return { stop: { key: "variable-not-simulated", variable: "HISTTIMEFORMAT" } };
    }
    // `history` marks an entry the player edited without running it with `*` (ADR 0066).
    const lines = current.entries.slice(first).map((entry, offset) => {
      const number = String(current.base + first + offset).padStart(5);
      return `${number}${entry.original === undefined ? " " : "*"} ${entry.line}\n`;
    });
    stdout(lines.join(""));
    return exit(0);
  },
});

/** The discard after "too many arguments", with the history as changed before (`-c`). */
function discard(session: Session, current: History): CommandResult {
  return current === session.history
    ? { discard: true }
    : { discard: true, session: { ...session, history: current } };
}

/**
 * Deletes what the argument of `-d` names, like `history_builtin`: a position as `history` shows
 * it, a negative offset from the end (`-1` is the newest entry, which is the `history -d` line
 * itself), or a range `START-END` of such positions.
 */
function deleteEntries(history: History, argument: string): DeleteResult {
  const negative = argument.startsWith("-");
  const dash = argument.indexOf("-", negative ? 1 : 0);
  return dash === -1
    ? deleteOne(history, argument, negative)
    : deleteRange(history, argument, dash, negative);
}

/** `-d OFFSET`: one entry. */
function deleteOne(history: History, argument: string, negative: boolean): DeleteResult {
  const offset = legalNumber(argument);
  if (offset === undefined) {
    return { kind: "out-of-range", position: argument };
  }
  const length = BigInt(history.entries.length);
  const base = BigInt(history.base);
  let index: bigint;
  if (negative && offset < 0n) {
    index = length + offset;
    if (index < 0n) {
      return { kind: "out-of-range", position: argument };
    }
  } else if (offset < base || offset >= base + length) {
    return { kind: "out-of-range", position: argument };
  } else {
    index = offset - base;
  }
  return removed(removeHistoryRange(history, Number(index), Number(index)));
}

/**
 * `-d START-END`: the entries from START to END. Each end may be a negative offset from the end
 * of the list. A start of 0 is the first entry, as bash only moves positive numbers by the base.
 * After an end outside the list bash names only that end.
 */
function deleteRange(
  history: History,
  argument: string,
  dash: number,
  negative: boolean,
): DeleteResult {
  const startText = argument.slice(0, dash);
  const endText = argument.slice(dash + 1);
  const startNumber = legalNumber(startText);
  const endNumber = legalNumber(endText);
  if (startNumber === undefined || endNumber === undefined) {
    return { kind: "out-of-range", position: argument };
  }
  const length = BigInt(history.entries.length);
  const start = toIndex(history, startNumber, negative);
  if (start < 0n || start >= length) {
    return { kind: "out-of-range", position: startText };
  }
  const end = toIndex(history, endNumber, endText.startsWith("-"));
  if (end < 0n || end >= length) {
    return { kind: "out-of-range", position: endText };
  }
  return removed(removeHistoryRange(history, Number(start), Number(end)));
}

/** One end of a range as an index: negative offsets count from the end, positions from the base. */
function toIndex(history: History, value: bigint, negative: boolean): bigint {
  if (negative && value < 0n) {
    return value + BigInt(history.entries.length);
  }
  return value > 0n ? value - BigInt(history.base) : value;
}

function removed(history: History | undefined): DeleteResult {
  return history === undefined ? { kind: "empty-range" } : { kind: "deleted", history };
}
