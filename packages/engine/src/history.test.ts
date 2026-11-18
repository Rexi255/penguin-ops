import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import {
  addHistoryEntry,
  applyHistorySize,
  clearHistory,
  EMPTY_HISTORY,
  type History,
  historyControl,
  recordHistory,
  removeHistoryRange,
  stifleHistory,
} from "./history";
import { createSession, type Session, setVariable } from "./session";
import { buildWorld } from "./world-builder";

function history(entries: readonly string[], base = 1, limit?: number): History {
  return { entries, base, limit };
}

describe("historyControl", () => {
  test("reads each word of a colon-separated list", () => {
    expect(historyControl("ignorespace")).toEqual({
      ignoreSpace: true,
      ignoreDups: false,
      eraseDups: false,
    });
    expect(historyControl("ignoredups:erasedups")).toEqual({
      ignoreSpace: false,
      ignoreDups: true,
      eraseDups: true,
    });
  });

  test("ignoreboth is ignorespace and ignoredups", () => {
    expect(historyControl("ignoreboth")).toEqual({
      ignoreSpace: true,
      ignoreDups: true,
      eraseDups: false,
    });
  });

  test("an unset or empty value, unknown words and other spellings ask for nothing", () => {
    const nothing = { ignoreSpace: false, ignoreDups: false, eraseDups: false };
    expect(historyControl(undefined)).toEqual(nothing);
    expect(historyControl("")).toEqual(nothing);
    expect(historyControl("IgnoreBoth:ignore both: ignorespace")).toEqual(nothing);
  });

  test("empty words between colons are skipped", () => {
    expect(historyControl("::erasedups:").eraseDups).toBe(true);
  });
});

describe("addHistoryEntry", () => {
  test("adds the line as the newest entry", () => {
    expect(addHistoryEntry(history(["a"]), "b")).toEqual(history(["a", "b"]));
  });

  test("a full list drops its oldest entry and counts on from the next number", () => {
    expect(addHistoryEntry(history(["a", "b"], 3, 2), "c")).toEqual(history(["b", "c"], 4, 2));
  });

  test("a list limited to 0 entries saves nothing", () => {
    const empty = history([], 1, 0);
    expect(addHistoryEntry(empty, "a")).toBe(empty);
  });
});

describe("stifleHistory", () => {
  test("keeps a list that fits and sets the limit", () => {
    expect(stifleHistory(history(["a", "b"], 5), 3)).toEqual(history(["a", "b"], 5, 3));
  });

  test("@differential removes the oldest entries and sets the base to their number", () => {
    // readline 8.2 sets `history_base` to the number of removed entries.
    expect(stifleHistory(history(["a", "b", "c", "d", "e"], 1), 2)).toEqual(
      history(["d", "e"], 3, 2),
    );
    expect(stifleHistory(history(["a", "b", "c"], 10), 1)).toEqual(history(["c"], 2, 1));
  });

  test("a limit of 0 removes every entry", () => {
    expect(stifleHistory(history(["a", "b"]), 0)).toEqual(history([], 2, 0));
  });

  test("a negative limit counts as 0", () => {
    expect(stifleHistory(history(["a"]), -3)).toEqual(history([], 1, 0));
  });
});

describe("applyHistorySize", () => {
  const list = history(["a", "b", "c"], 1, 10);

  test("a number from 0 on limits the list", () => {
    expect(applyHistorySize(list, "2")).toEqual(history(["b", "c"], 1, 2));
    expect(applyHistorySize(list, " 5 ")).toEqual(history(["a", "b", "c"], 1, 5));
  });

  test("an unset or empty value or a negative number removes the limit", () => {
    expect(applyHistorySize(list, undefined).limit).toBeUndefined();
    expect(applyHistorySize(list, "").limit).toBeUndefined();
    expect(applyHistorySize(list, "-1")).toEqual(history(["a", "b", "c"], 1, undefined));
  });

  test("a value that is not a number changes nothing", () => {
    expect(applyHistorySize(list, "lots")).toBe(list);
    expect(applyHistorySize(list, "99999999999999999999")).toBe(list);
  });

  test("@differential a number beyond 32 bits is cut to a C int", () => {
    expect(applyHistorySize(list, "4294967298")).toEqual(history(["b", "c"], 1, 2));
    expect(applyHistorySize(list, "2147483648").limit).toBeUndefined();
  });
});

describe("clearHistory", () => {
  test("removes every entry, sets the base back to 1 and keeps the limit", () => {
    expect(clearHistory(history(["a", "b"], 7, 5))).toEqual(history([], 1, 5));
  });
});

describe("removeHistoryRange", () => {
  const list = history(["a", "b", "c", "d"], 4);

  test("removes the entries between two indexes, both included, and keeps the base", () => {
    expect(removeHistoryRange(list, 1, 2)).toEqual(history(["a", "d"], 4));
    expect(removeHistoryRange(list, 3, 3)).toEqual(history(["a", "b", "c"], 4));
  });

  test.each([
    ["a negative first index", -1, 1],
    ["a first index past the end", 4, 4],
    ["a negative last index", 0, -1],
    ["a last index past the end", 0, 4],
    ["a first index after the last", 2, 1],
  ])("gives undefined for %s", (_case, first, last) => {
    expect(removeHistoryRange(list, first, last)).toBeUndefined();
  });

  test("gives undefined for an empty list", () => {
    expect(removeHistoryRange(EMPTY_HISTORY, 0, 0)).toBeUndefined();
  });
});

describe("recordHistory", () => {
  const world = buildWorld(
    {
      hosts: [
        {
          name: "ws01",
          groups: [{ name: "alice", gid: 1000 }],
          users: [{ name: "alice", uid: 1000 }],
        },
      ],
    },
    createGameClock(0),
  );
  /** Alice with `HISTCONTROL=ignoreboth`, as Debian sets it. */
  const alice = createSession(world, "ws01", "alice");

  function record(session: Session, ...inputs: string[]): readonly string[] {
    return inputs.reduce(recordHistory, session).history.entries;
  }

  test("saves each input as one entry", () => {
    expect(record(alice, "ls", "cd /tmp", "pwd")).toEqual(["ls", "cd /tmp", "pwd"]);
  });

  test("saves an input that does not parse as it was typed", () => {
    expect(record(alice, "echo 'open")).toEqual(["echo 'open"]);
  });

  test("does not save an empty input", () => {
    const session = recordHistory(alice, "");
    expect(session).toBe(alice);
  });

  test("ignoreboth skips inputs that start with a space and repeats of the newest entry", () => {
    expect(record(alice, "ls", " secret", "ls", "pwd", "ls")).toEqual(["ls", "pwd", "ls"]);
  });

  test("a tab at the start is not a space for ignorespace", () => {
    expect(record(alice, "\tls")).toEqual(["\tls"]);
  });

  test("without HISTCONTROL every input is saved, also repeats and leading spaces", () => {
    const plain = setVariable(alice, "HISTCONTROL", undefined);
    expect(record(plain, "ls", "ls", " ls")).toEqual(["ls", "ls", " ls"]);
  });

  test("erasedups removes older equal entries before it saves the input", () => {
    const erasing = setVariable(alice, "HISTCONTROL", "erasedups");
    expect(record(erasing, "ls", "pwd", "ls", "cd", "ls")).toEqual(["pwd", "cd", "ls"]);
  });

  test("ignorespace wins over erasedups", () => {
    const both = setVariable(alice, "HISTCONTROL", "ignorespace:erasedups");
    expect(record(both, "ls", " ls")).toEqual(["ls"]);
  });

  test("keeps the limit from HISTSIZE and counts on", () => {
    const small = setVariable(alice, "HISTSIZE", "2");
    const session = ["a", "b", "c"].reduce(recordHistory, small);
    expect(session.history).toEqual(history(["b", "c"], 2, 2));
  });

  test("HISTSIZE=0 saves nothing", () => {
    expect(record(setVariable(alice, "HISTSIZE", "0"), "ls")).toEqual([]);
  });

  test("an input of several lines is one entry with its line breaks", () => {
    expect(record(alice, "echo 'a\nb'")).toEqual(["echo 'a\nb'"]);
  });
});
