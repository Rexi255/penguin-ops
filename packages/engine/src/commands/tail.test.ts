import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { runScript, type ScriptResult, type ShellEvent } from "../interpreter";
import { parse } from "../parser";
import { createSession, type Session } from "../session";
import { buildWorld } from "../world-builder";
import { COMMANDS } from ".";

const START = 1_700_000_000_000;

/** Twelve numbered lines. */
const LINES = Array.from({ length: 12 }, (_, index) => `${String(index + 1)}\n`);
const NUMBERS = LINES.join("");

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [
          { name: "root", gid: 0 },
          { name: "alice", gid: 1000 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "alice", uid: 1000 },
        ],
        files: {
          "/home/alice/numbers.txt": NUMBERS,
          "/home/alice/short.txt": "one\ntwo\n",
          "/home/alice/partial.txt": "a\nb\nc",
          "/home/alice/empty.txt": "",
          "/home/alice/zero.txt": "a\0b\0c\0",
          "/home/alice/umlaut.txt": "aä\n",
          "/home/alice/secret.txt": { content: "secret\n", mode: 0o200 },
          "/home/alice/docs/": {},
          "/srv/closed/": { mode: 0o700 },
          "/srv/closed/inside.txt": "inside\n",
        },
      },
    ],
  },
  createGameClock(START),
);

const alice = createSession(world, "ws01", "alice");

const commands = createCommandLookup(COMMANDS);

function run(input: string, session: Session = alice): ScriptResult {
  const parsed = parse(input);
  if (!parsed.ok) {
    throw new Error(`test input does not parse: ${input}`);
  }
  return runScript({
    world,
    session,
    script: parsed.script,
    commands,
    clock: createGameClock(START),
    terminal: { columns: 80 },
  });
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

function notice(option: string): ShellEvent {
  return { kind: "notice", command: "tail", notice: { key: "option-not-simulated", option } };
}

/** The last `count` numbered lines. */
function last(count: number): string {
  return LINES.slice(LINES.length - count).join("");
}

/** The numbered lines from line `line` on. */
function from(line: number): string {
  return LINES.slice(line - 1).join("");
}

const TRY_HELP = "Try 'tail --help' for more information.\n";

describe("tail with files", () => {
  test("writes the last ten lines", () => {
    const result = run("tail numbers.txt");
    expect(result.events).toEqual([stdout(last(10))]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("writes a shorter file completely", () => {
    expect(run("tail short.txt").events).toEqual([stdout("one\ntwo\n")]);
  });

  test("an empty file writes nothing", () => {
    const result = run("tail empty.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("a last line without a line break counts as a line", () => {
    expect(run("tail -n 1 partial.txt").events).toEqual([stdout("c")]);
    expect(run("tail -n 2 partial.txt").events).toEqual([stdout("b\nc")]);
  });
});

describe("tail -n", () => {
  test.each([
    ["tail -n 3 numbers.txt", last(3)],
    ["tail -n3 numbers.txt", last(3)],
    ["tail -n -3 numbers.txt", last(3)],
    ["tail --lines=4 numbers.txt", last(4)],
    ["tail -n 100 numbers.txt", NUMBERS],
    ["tail -n 1k numbers.txt", NUMBERS],
    ["tail -n 99999999999999999999 numbers.txt", NUMBERS],
  ])("%s", (input, text) => {
    expect(run(input).events).toEqual([stdout(text)]);
  });

  test.each([
    ["tail -n +3 numbers.txt", from(3)],
    ["tail -n +1 numbers.txt", NUMBERS],
    ["tail -n +0 numbers.txt", NUMBERS],
    ["tail -n +12 numbers.txt", from(12)],
    ["tail --lines=+11 numbers.txt", from(11)],
    ["tail -n +3 partial.txt", "c"],
  ])("%s starts at a line", (input, text) => {
    expect(run(input).events).toEqual([stdout(text)]);
  });

  test("a start after the last line writes nothing", () => {
    const result = run("tail -n +13 numbers.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("a start after the last line of a file without a final line break writes nothing", () => {
    expect(run("tail -n +4 partial.txt").events).toEqual([]);
  });

  test("a + stays when a later count has none", () => {
    expect(run("tail -n +11 -n 3 numbers.txt").events).toEqual([stdout(from(3))]);
  });

  test("the last count's unit wins", () => {
    expect(run("tail -n 1 -c 3 short.txt").events).toEqual([stdout("wo\n")]);
  });
});

describe("tail: counts that write nothing", () => {
  test("-n 0 reads nothing, so even a missing file is no error", () => {
    const result = run("tail -n 0 missing.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("a start beyond 64 bits reads nothing either", () => {
    const result = run("tail -n +99999999999999999999 missing.txt docs");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("-c 0 and the terminal give no notice", () => {
    const result = run("tail -c 0");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });
});

describe("tail -c", () => {
  test.each([
    ["tail -c 4 short.txt", "two\n"],
    ["tail --bytes=2 short.txt", "o\n"],
    ["tail -c 100 short.txt", "one\ntwo\n"],
    ["tail -c +2 short.txt", "ne\ntwo\n"],
    ["tail -c +0 short.txt", "one\ntwo\n"],
    ["tail -c +100 short.txt", ""],
    ["tail -c 1b short.txt", "one\ntwo\n"],
  ])("%s", (input, text) => {
    const result = run(input);
    expect(result.events).toEqual(text === "" ? [] : [stdout(text)]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("whole characters outside ASCII are written", () => {
    expect(run("tail -c 3 umlaut.txt").events).toEqual([stdout("ä\n")]);
  });

  test("half a character stops the input with a notice", () => {
    const result = run("tail -c 2 umlaut.txt");
    expect(result.events).toEqual([
      { kind: "notice", command: "tail", notice: { key: "invalid-utf8-not-simulated" } },
    ]);
    expect(result.session.exitStatus).toBe(1);
  });
});

describe("tail -z", () => {
  test("lines end with NUL", () => {
    expect(run("tail -z -n 2 zero.txt").events).toEqual([stdout("b\0c\0")]);
    expect(run("tail --zero-terminated -n +3 zero.txt").events).toEqual([stdout("c\0")]);
  });
});

describe("tail with several files", () => {
  test("writes a header before each file and an empty line between them", () => {
    expect(run("tail -n 1 short.txt numbers.txt").events).toEqual([
      stdout("==> short.txt <==\ntwo\n\n==> numbers.txt <==\n12\n"),
    ]);
  });

  test.each(["-q", "--quiet", "--silent"])("%s leaves out the headers", (option) => {
    expect(run(`tail ${option} -n 1 short.txt numbers.txt`).events).toEqual([stdout("two\n12\n")]);
  });

  test.each(["-v", "--verbose"])("%s writes a header also for one file", (option) => {
    expect(run(`tail ${option} -n 1 short.txt`).events).toEqual([
      stdout("==> short.txt <==\ntwo\n"),
    ]);
  });
});

describe("tail with standard input", () => {
  test("reads standard input without operands", () => {
    expect(run("cat numbers.txt | tail -n 2").events).toEqual([stdout(last(2))]);
  });

  test("reads standard input for -", () => {
    expect(run("tail -n 1 - < short.txt").events).toEqual([stdout("two\n")]);
  });

  test("a second - finds standard input at its end", () => {
    expect(run("tail -n 1 - - < short.txt").events).toEqual([
      stdout("==> standard input <==\ntwo\n\n==> standard input <==\n"),
    ]);
  });

  test("a directory as standard input cannot be read", () => {
    const result = run("tail < docs");
    expect(result.events).toEqual([
      stderr("tail: error reading 'standard input': Is a directory\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("the terminal stops the input with a notice", () => {
    const result = run("tail -v");
    expect(result.events).toEqual([
      stdout("==> standard input <==\n"),
      { kind: "notice", command: "tail", notice: { key: "terminal-input-not-simulated" } },
    ]);
    expect(result.session.exitStatus).toBe(1);
  });
});

describe("tail: obsolete options", () => {
  test.each([
    ["tail -3 numbers.txt", last(3)],
    ["tail -3l numbers.txt", last(3)],
    ["tail +11 numbers.txt", from(11)],
    ["tail +11l numbers.txt", from(11)],
    ["tail -l numbers.txt", last(10)],
    ["tail + numbers.txt", from(10)],
    ["tail -4c short.txt", "two\n"],
    ["tail +2c short.txt", "ne\ntwo\n"],
    ["tail -1b short.txt", "one\ntwo\n"],
    ["tail -b short.txt", "one\ntwo\n"],
    ["tail -3 -- numbers.txt", last(3)],
    ["tail -3 - < numbers.txt", last(3)],
  ])("%s", (input, text) => {
    expect(run(input).events).toEqual([stdout(text)]);
  });

  test("reads standard input without a file operand", () => {
    expect(run("cat numbers.txt | tail -2").events).toEqual([stdout(last(2))]);
  });

  test("with f, it follows the file, which the game does not simulate", () => {
    expect(run("tail -3f numbers.txt").events).toEqual([notice("-f")]);
    expect(run("tail -f numbers.txt").events).toEqual([notice("-f")]);
    expect(run("tail -cf numbers.txt").events).toEqual([notice("-f")]);
  });

  test("is not read with two file operands", () => {
    expect(run("tail -3 numbers.txt short.txt").events).toEqual([
      stderr(`tail: option used in invalid context -- 3\n`),
    ]);
  });

  test("is not read when the second argument is an option", () => {
    expect(run("tail -3 -v").events).toEqual([
      stderr(`tail: option used in invalid context -- 3\n`),
    ]);
  });

  test("a + argument of another form is a file", () => {
    expect(run("tail +x").events).toEqual([
      stderr("tail: cannot open '+x' for reading: No such file or directory\n"),
    ]);
  });

  test("-c alone needs its argument", () => {
    expect(run("tail -c").events).toEqual([
      stderr(`tail: option requires an argument -- 'c'\n${TRY_HELP}`),
    ]);
  });

  test("too many digits are an error with the reason of strtoumax", () => {
    const result = run("tail -99999999999999999999 numbers.txt");
    expect(result.events).toEqual([
      stderr("tail: invalid number: ‘-99999999999999999999’: Numerical result out of range\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a block count that overflows is an error without a reason", () => {
    expect(run("tail -36028797018963968b numbers.txt").events).toEqual([
      stderr("tail: invalid number: ‘-36028797018963968b’\n"),
    ]);
  });
});

describe("tail: errors", () => {
  test.each([
    ["missing.txt", "No such file or directory"],
    ["short.txt/x", "Not a directory"],
    ["secret.txt", "Permission denied"],
    ["/srv/closed/inside.txt", "Permission denied"],
  ])("%s cannot be opened: %s", (operand, message) => {
    const result = run(`tail ${operand}`);
    expect(result.events).toEqual([
      stderr(`tail: cannot open '${operand}' for reading: ${message}\n`),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a file that cannot be opened gets no header, and tail goes on", () => {
    const result = run("tail -n 1 missing.txt short.txt");
    expect(result.events).toEqual([
      stderr("tail: cannot open 'missing.txt' for reading: No such file or directory\n"),
      stdout("==> short.txt <==\ntwo\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a directory gets its header, then the read fails and tail goes on", () => {
    const result = run("tail -n 1 docs short.txt");
    expect(result.events).toEqual([
      stdout("==> docs <==\n"),
      stderr("tail: error reading 'docs': Is a directory\n"),
      stdout("\n==> short.txt <==\ntwo\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a directory with -n +2 fails and tail goes on", () => {
    const result = run("tail -n +2 docs short.txt");
    expect(result.events).toEqual([
      stdout("==> docs <==\n"),
      stderr("tail: error reading 'docs': Is a directory\n"),
      stdout("\n==> short.txt <==\ntwo\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test.each(["-n +1", "-n +0", "-c 5", "-c +3"])(
    "@differential a directory with %s ends tail at once",
    (options) => {
      const result = run(`tail ${options} docs short.txt`);
      expect(result.events).toEqual([
        stdout("==> docs <==\n"),
        stderr("tail: error reading 'docs': Is a directory\n"),
      ]);
      expect(result.session.exitStatus).toBe(1);
    },
  );

  test("@differential a directory with a byte count beyond lseek's range fails and tail goes on", () => {
    const result = run("tail -c 99999999999999999999 docs short.txt");
    expect(result.events).toEqual([
      stdout("==> docs <==\n"),
      stderr("tail: error reading 'docs': Is a directory\n"),
      stdout("\n==> short.txt <==\none\ntwo\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test.each([
    ["-n abc", "invalid number of lines: ‘abc’"],
    ["-n +abc", "invalid number of lines: ‘+abc’"],
    ["-n +-5", "invalid number of lines: ‘+-5’"],
    ["-n --5", "invalid number of lines: ‘-5’"],
    ["-c 5x", "invalid number of bytes: ‘5x’"],
  ])("tail %s: %s", (options, message) => {
    const result = run(`tail ${options} short.txt`);
    expect(result.events).toEqual([stderr(`tail: ${message}\n`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a digit as an option is used in an invalid context", () => {
    const result = run("tail -n 1 -5");
    expect(result.events).toEqual([stderr("tail: option used in invalid context -- 5\n")]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("an invalid option is a usage error", () => {
    const result = run("tail -x");
    expect(result.events).toEqual([stderr(`tail: invalid option -- 'x'\n${TRY_HELP}`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test.each([
    ["tail -f short.txt", "-f"],
    ["tail -F short.txt", "-F"],
    ["tail --follow=name short.txt", "--follow"],
    ["tail --retry short.txt", "--retry"],
    ["tail -s 2 short.txt", "-s"],
    ["tail --pid=1 short.txt", "--pid"],
    ["tail --max-unchanged-stats=3 short.txt", "--max-unchanged-stats"],
    ["tail ---disable-inotify short.txt", "---disable-inotify"],
    ["tail ---presume-input-pipe short.txt", "---presume-input-pipe"],
    ["tail --help", "--help"],
    ["tail --version", "--version"],
  ])("%s gives a notice", (input, option) => {
    expect(run(input).events).toEqual([notice(option)]);
  });
});
