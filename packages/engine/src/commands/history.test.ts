import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { recordHistory } from "../history";
import { runScript, type ScriptResult, type ShellEvent } from "../interpreter";
import { parse } from "../parser";
import { createSession, type Session, setVariable } from "../session";
import { buildWorld } from "../world-builder";
import { COMMANDS } from ".";

const START = 1_700_000_000_000;

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [{ name: "alice", gid: 1000 }],
        users: [{ name: "alice", uid: 1000 }],
        files: { "/home/alice/": {}, "/tmp/": { mode: 0o1777 } },
      },
    ],
  },
  createGameClock(START),
);

/** Alice with Debian's `HISTCONTROL=ignoreboth` and `HISTSIZE=1000`. */
const alice = createSession(world, "ws01", "alice");

/** Alice without `HISTCONTROL`, so that every input is saved. */
const plain = setVariable(alice, "HISTCONTROL", undefined);

const commands = createCommandLookup(COMMANDS);

/**
 * Enters the inputs one after the other like the game does: each input is saved in the history
 * first and then runs. Returns the result of the last input.
 */
function play(inputs: readonly string[], session: Session = plain): ScriptResult {
  let state: ScriptResult = { world, session, events: [] };
  for (const input of inputs) {
    const parsed = parse(input);
    if (!parsed.ok) {
      throw new Error(`test input does not parse: ${input}`);
    }
    state = runScript({
      world: state.world,
      session: recordHistory(state.session, input),
      script: parsed.script,
      commands,
      clock: createGameClock(START),
      terminal: { columns: 80 },
    });
  }
  return state;
}

/** The lines of `history` for the entries, numbered from `base`. */
function listing(entries: readonly string[], base = 1): string {
  return entries.map((entry, index) => `${String(base + index).padStart(5)}  ${entry}\n`).join("");
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

const USAGE =
  "history: usage: history [-c] [-d offset] [n] or history -anrw [filename] or " +
  "history -ps arg [arg...]\n";

function outOfRange(position: string): ShellEvent {
  return stderr(`bash: history: ${position}: history position out of range\n`);
}

describe("history: listing", () => {
  test("lists the entries with their numbers, the history line itself last", () => {
    const result = play(["ls", "cd /tmp", "history"]);
    expect(result.events).toEqual([stdout(listing(["ls", "cd /tmp", "history"]))]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("an empty history lists nothing", () => {
    const result = play(["history"], setVariable(plain, "HISTSIZE", "0"));
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("N lists the last N entries", () => {
    expect(play(["a", "b", "c", "history 2"]).events).toEqual([
      stdout(listing(["c", "history 2"], 3)),
    ]);
  });

  test("a negative N after `--` counts like a positive one", () => {
    expect(play(["a", "b", "history -- -2"]).events).toEqual([
      stdout(listing(["b", "history -- -2"], 2)),
    ]);
  });

  test("N of 0 lists nothing", () => {
    const result = play(["a", "history 0"]);
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("N larger than the list lists everything", () => {
    expect(play(["a", "history 99999999999"]).events).toEqual([
      stdout(listing(["a", "history 99999999999"])),
    ]);
  });

  test("a second `--` instead of N lists the newest entry, as `get_numeric_arg` counts 1", () => {
    expect(play(["a", "history -- --"]).events).toEqual([stdout(listing(["history -- --"], 2))]);
  });

  test("numbers wider than five digits push the line to the right", () => {
    const session: Session = {
      ...plain,
      history: { entries: [{ line: "a" }], base: 123456, limit: undefined },
    };
    expect(play(["history"], session).events).toEqual([stdout("123456  a\n123457  history\n")]);
  });

  test("an entry the player edited without running it is marked with *", () => {
    const session: Session = {
      ...plain,
      history: {
        entries: [{ line: "echo a" }, { line: "echo bX", original: "echo b" }],
        base: 1,
        limit: undefined,
      },
    };
    expect(play(["history"], session).events).toEqual([
      stdout("    1  echo a\n    2* echo bX\n    3  history\n"),
    ]);
  });

  test("an entry of several lines is shown with its line breaks", () => {
    const session: Session = {
      ...plain,
      history: { entries: [{ line: "echo 'a\nb'" }], base: 1, limit: undefined },
    };
    expect(play(["history"], session).events).toEqual([
      stdout("    1  echo 'a\nb'\n    2  history\n"),
    ]);
  });

  test("with ignoreboth, repeats and inputs that start with a space are missing", () => {
    expect(play(["ls", "ls", " secret", "history"], alice).events).toEqual([
      stdout(listing(["ls", "history"])),
    ]);
  });

  test("a full list counts on from the next number", () => {
    const small = setVariable(plain, "HISTSIZE", "3");
    expect(play(["a", "b", "c", "d", "history"], small).events).toEqual([
      stdout(listing(["c", "d", "history"], 3)),
    ]);
  });

  test("@differential a smaller HISTSIZE renumbers the kept entries like readline 8.2", () => {
    // `HISTSIZE=2` keeps "d" and itself and sets the base to 3, the number of removed entries;
    // then "history" pushes "d" out and the base becomes 4.
    expect(play(["a", "b", "c", "d", "HISTSIZE=2", "history"]).events).toEqual([
      stdout(listing(["HISTSIZE=2", "history"], 4)),
    ]);
  });

  test("N that is not a number is an error with exit status 1", () => {
    const result = play(["history abc"]);
    expect(result.events).toEqual([stderr("bash: history: abc: numeric argument required\n")]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("an empty HISTTIMEFORMAT changes nothing", () => {
    expect(play(["HISTTIMEFORMAT=", "history"]).events).toEqual([
      stdout(listing(["HISTTIMEFORMAT=", "history"])),
    ]);
  });

  test("a HISTTIMEFORMAT with a value stops the input with a notice", () => {
    const result = play(["HISTTIMEFORMAT='%F '", "history; echo after"]);
    expect(result.events).toEqual([
      {
        kind: "notice",
        command: "history",
        notice: { key: "variable-not-simulated", variable: "HISTTIMEFORMAT" },
      },
    ]);
    expect(result.session.exitStatus).toBe(1);
  });
});

describe("history: too many arguments", () => {
  test("writes bash's message and discards the rest of the input with exit status 1", () => {
    const result = play(["history 1 2; echo after"]);
    expect(result.events).toEqual([stderr("bash: history: too many arguments\n")]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("@differential keeps a non-zero exit status from before", () => {
    const result = play(["nope; history 1 2"]);
    expect(result.events).toEqual([
      stderr("bash: nope: command not found\nbash: history: too many arguments\n"),
    ]);
    expect(result.session.exitStatus).toBe(127);
  });

  test("inside a pipeline only the subshell ends, with exit status 1", () => {
    const result = play(["echo x | history 1 2; echo $?"]);
    expect(result.events).toEqual([stderr("bash: history: too many arguments\n"), stdout("1\n")]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("the commands before it in the input have run", () => {
    const result = play(["cd /tmp && history 1 2"]);
    expect(result.session.cwd).toBe("/tmp");
    expect(result.session.exitStatus).toBe(1);
  });

  test("a temporary assignment before it is undone", () => {
    const result = play(["HISTSIZE=5 history 1 2"]);
    expect(result.session.variables.get("HISTSIZE")).toBe("1000");
  });
});

describe("history -c", () => {
  test("clears the history; the next input is entry 1 again", () => {
    const cleared = play(["a", "b", "history -c"]);
    expect(cleared.events).toEqual([]);
    expect(cleared.session.exitStatus).toBe(0);
    expect(cleared.session.history.entries.map((entry) => entry.line)).toEqual([]);
    expect(play(["history"], cleared.session).events).toEqual([stdout(listing(["history"]))]);
  });

  test("with N it clears and then lists the empty history", () => {
    const result = play(["a", "history -c 5"]);
    expect(result.events).toEqual([]);
    expect(result.session.history.entries.map((entry) => entry.line)).toEqual([]);
  });

  test("ignores -d without operands, because it is done after clearing", () => {
    const result = play(["a", "history -c -d 1"]);
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("an error after clearing keeps the history cleared", () => {
    const result = play(["a", "history -c abc"]);
    expect(result.events).toEqual([stderr("bash: history: abc: numeric argument required\n")]);
    expect(result.session.exitStatus).toBe(1);
    expect(result.session.history.entries.map((entry) => entry.line)).toEqual([]);
  });

  test("too many arguments after clearing keep the history cleared", () => {
    const result = play(["a", "history -c 1 2; echo after"]);
    expect(result.events).toEqual([stderr("bash: history: too many arguments\n")]);
    expect(result.session.history.entries.map((entry) => entry.line)).toEqual([]);
  });

  test("-d after clearing with an operand finds nothing to delete", () => {
    const result = play(["a", "history -c -d 1 5"]);
    expect(result.events).toEqual([outOfRange("1")]);
    expect(result.session.history.entries.map((entry) => entry.line)).toEqual([]);
  });
});

describe("history -d", () => {
  test("deletes the entry at a position as listed and keeps the numbering base", () => {
    const result = play(["a", "b", "c", "history -d 2"]);
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(result.session.history.entries.map((entry) => entry.line)).toEqual([
      "a",
      "c",
      "history -d 2",
    ]);
  });

  test("takes its argument from the same word", () => {
    expect(
      play(["a", "b", "history -d1"]).session.history.entries.map((entry) => entry.line),
    ).toEqual(["b", "history -d1"]);
  });

  test("counts positions from the base of a full list", () => {
    const small = setVariable(plain, "HISTSIZE", "3");
    const result = play(["a", "b", "c", "d", "history -d 3"], small);
    // The list holds c (3), d (4) and the history line (5).
    expect(result.session.history).toEqual({
      entries: [{ line: "d" }, { line: "history -d 3" }],
      base: 3,
      limit: 3,
    });
  });

  test("-1 deletes the newest entry, the history -d line itself", () => {
    expect(play(["a", "history -d -1"]).session.history.entries.map((entry) => entry.line)).toEqual(
      ["a"],
    );
  });

  test("a negative offset counts back from the end", () => {
    expect(
      play(["a", "b", "history -d -3"]).session.history.entries.map((entry) => entry.line),
    ).toEqual(["b", "history -d -3"]);
  });

  test("deletes a range of positions, both ends included", () => {
    expect(
      play(["a", "b", "c", "d", "history -d 2-3"]).session.history.entries.map(
        (entry) => entry.line,
      ),
    ).toEqual(["a", "d", "history -d 2-3"]);
  });

  test("deletes a range given by negative offsets", () => {
    expect(
      play(["a", "b", "c", "history -d -3--2"]).session.history.entries.map((entry) => entry.line),
    ).toEqual(["a", "history -d -3--2"]);
  });

  test("a range may mix a position and a negative offset", () => {
    expect(
      play(["a", "b", "c", "history -d 2--1"]).session.history.entries.map((entry) => entry.line),
    ).toEqual(["a"]);
  });

  test("a range from 0 starts at the first entry", () => {
    expect(
      play(["a", "b", "c", "history -d 0-1"]).session.history.entries.map((entry) => entry.line),
    ).toEqual(["b", "c", "history -d 0-1"]);
  });

  test.each([
    ["a position after the last entry", "history -d 9", "9"],
    ["position 0", "history -d 0", "0"],
    ["a position that is not a number", "history -d abc", "abc"],
    ["an empty position", "history -d ''", ""],
    ["a negative offset before the first entry", "history -d -9", "-9"],
    ["`-0`, which is not negative", "history -d -0", "-0"],
    ["a range with a part that is not a number", "history -d 1-x", "1-x"],
    ["a range starting after the last entry", "history -d 9-1", "9"],
    ["a range ending after the last entry", "history -d 1-9", "9"],
    ["a range ending before the first entry", "history -d 1--9", "-9"],
  ])("%s is out of range with exit status 1", (_case, input, position) => {
    const result = play(["a", input]);
    expect(result.events).toEqual([outOfRange(position)]);
    expect(result.session.exitStatus).toBe(1);
    expect(result.session.history.entries.map((entry) => entry.line)).toEqual(["a", input]);
  });

  test("a range whose start comes after its end fails without a message", () => {
    const result = play(["a", "b", "history -d 2-1"]);
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(1);
    expect(result.session.history.entries.map((entry) => entry.line)).toEqual([
      "a",
      "b",
      "history -d 2-1",
    ]);
  });

  test("ignores operands", () => {
    expect(
      play(["a", "history -d 1 abc"]).session.history.entries.map((entry) => entry.line),
    ).toEqual(["history -d 1 abc"]);
  });

  test("without an argument it gives bash's usage error with exit status 2", () => {
    const result = play(["history -d"]);
    expect(result.events).toEqual([
      stderr("bash: history: -d: option requires an argument\n" + USAGE),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });
});

describe("history: options", () => {
  test.each(["-a", "-n", "-r", "-w", "-p", "-s", "--help"])(
    "%s stops the input with a notice",
    (option) => {
      const result = play([`history ${option} x; echo after`]);
      expect(result.events).toEqual([
        { kind: "notice", command: "history", notice: { key: "option-not-simulated", option } },
      ]);
      expect(result.session.exitStatus).toBe(1);
    },
  );

  test("an invalid option gives bash's message and the usage line with exit status 2", () => {
    const result = play(["history -x"]);
    expect(result.events).toEqual([stderr("bash: history: -x: invalid option\n" + USAGE)]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("a negative N without `--` is an invalid option", () => {
    expect(play(["history -5"]).events).toEqual([
      stderr("bash: history: -5: invalid option\n" + USAGE),
    ]);
  });
});
