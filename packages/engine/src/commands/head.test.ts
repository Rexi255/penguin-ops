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

/** A text of 9000 bytes in lines of 10 bytes, longer than head's read buffer of 8192 bytes. */
const LONG = Array.from({ length: 900 }, (_, index) => `${String(index).padStart(9, "0")}\n`).join(
  "",
);

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
          "/home/alice/long.txt": LONG,
          "/home/alice/zero.txt": "a\0b\0c\0",
          "/home/alice/umlaut.txt": "äb\n",
          "/home/alice/my file.txt": "spaced\n",
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

/** The first `count` numbered lines. */
function first(count: number): string {
  return LINES.slice(0, count).join("");
}

const TRY_HELP = "Try 'head --help' for more information.\n";

describe("head with files", () => {
  test("writes the first ten lines", () => {
    const result = run("head numbers.txt");
    expect(result.events).toEqual([stdout(first(10))]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("writes a shorter file completely", () => {
    expect(run("head short.txt").events).toEqual([stdout("one\ntwo\n")]);
  });

  test("an empty file writes nothing", () => {
    const result = run("head empty.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("a last line without a line break counts", () => {
    expect(run("head -n 3 partial.txt").events).toEqual([stdout("a\nb\nc")]);
  });

  test("reads absolute paths and names with spaces", () => {
    expect(run("head '/home/alice/my file.txt'").events).toEqual([stdout("spaced\n")]);
  });
});

describe("head -n", () => {
  test.each([
    ["head -n 3 numbers.txt", 3],
    ["head -n3 numbers.txt", 3],
    ["head --lines=4 numbers.txt", 4],
    ["head --lines 2 numbers.txt", 2],
    ["head --li=1 numbers.txt", 1],
    ["head -n +2 numbers.txt", 2],
    ["head -n ' 2' numbers.txt", 2],
    ["head -n 100 numbers.txt", 12],
  ])("%s writes %i lines", (input, count) => {
    expect(run(input).events).toEqual([stdout(first(count))]);
  });

  test("-n 0 writes nothing", () => {
    const result = run("head -n 0 numbers.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("a count with a multiplier suffix", () => {
    expect(run("head -n 1k numbers.txt").events).toEqual([stdout(NUMBERS)]);
  });

  test("a count too large for 64 bits means all lines", () => {
    expect(run("head -n 99999999999999999999 numbers.txt").events).toEqual([stdout(NUMBERS)]);
  });

  test("the last count wins", () => {
    expect(run("head -n 5 -n 2 numbers.txt").events).toEqual([stdout(first(2))]);
  });

  test("options may come after the operands", () => {
    expect(run("head numbers.txt -n 1").events).toEqual([stdout(first(1))]);
  });
});

describe("head -n -N: all but the last lines", () => {
  test("leaves out the last lines", () => {
    expect(run("head -n -10 numbers.txt").events).toEqual([stdout(first(2))]);
  });

  test("a last line without a line break counts as a line", () => {
    expect(run("head -n -1 partial.txt").events).toEqual([stdout("a\nb\n")]);
  });

  test("with a line break at the end, the last line is the one before it", () => {
    expect(run("head -n -1 short.txt").events).toEqual([stdout("one\n")]);
  });

  test("-n -0 writes everything", () => {
    expect(run("head -n -0 numbers.txt").events).toEqual([stdout(NUMBERS)]);
  });

  test("more lines than the file has write nothing", () => {
    const result = run("head -n -20 numbers.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });
});

describe("head -c", () => {
  test.each([
    ["head -c 5 numbers.txt", "1\n2\n3"],
    ["head --bytes=2 short.txt", "on"],
    ["head -c 0 short.txt", ""],
    ["head -c 100 short.txt", "one\ntwo\n"],
    ["head -c -3 short.txt", "one\nt"],
    ["head -c -100 short.txt", ""],
    ["head -c -0 short.txt", "one\ntwo\n"],
    ["head -c 1b numbers.txt", NUMBERS],
  ])("%s", (input, text) => {
    const result = run(input);
    expect(result.events).toEqual(text === "" ? [] : [stdout(text)]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("whole characters outside ASCII are written", () => {
    expect(run("head -c 2 umlaut.txt").events).toEqual([stdout("ä")]);
  });

  test("half a character stops the input with a notice, because the game cannot show it", () => {
    const result = run("head -c 1 umlaut.txt; echo next");
    expect(result.events).toEqual([
      { kind: "notice", command: "head", notice: { key: "invalid-utf8-not-simulated" } },
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("the output of earlier files stays when a later one is cut", () => {
    expect(run("head -c 1 short.txt umlaut.txt").events).toEqual([
      stdout("==> short.txt <==\no\n==> umlaut.txt <==\n"),
      { kind: "notice", command: "head", notice: { key: "invalid-utf8-not-simulated" } },
    ]);
  });

  test("-n after -c counts lines again", () => {
    expect(run("head -c 1 -n 1 short.txt").events).toEqual([stdout("one\n")]);
  });
});

describe("head -z", () => {
  test("lines end with NUL", () => {
    expect(run("head -z -n 2 zero.txt").events).toEqual([stdout("a\0b\0")]);
    expect(run("head --zero-terminated -n -1 zero.txt").events).toEqual([stdout("a\0b\0")]);
  });

  test("newlines are ordinary bytes then", () => {
    expect(run("head -z -n 1 short.txt").events).toEqual([stdout("one\ntwo\n")]);
  });
});

describe("head with several files", () => {
  test("writes a header before each file and an empty line between them", () => {
    expect(run("head -n 1 short.txt numbers.txt").events).toEqual([
      stdout("==> short.txt <==\none\n\n==> numbers.txt <==\n1\n"),
    ]);
  });

  test("a header shows the operand as written", () => {
    expect(run("head -n 1 ./short.txt '/home/alice/my file.txt'").events).toEqual([
      stdout("==> ./short.txt <==\none\n\n==> /home/alice/my file.txt <==\nspaced\n"),
    ]);
  });

  test.each(["-q", "--quiet", "--silent"])("%s leaves out the headers", (option) => {
    expect(run(`head ${option} -n 1 short.txt numbers.txt`).events).toEqual([stdout("one\n1\n")]);
  });

  test.each(["-v", "--verbose"])("%s writes a header also for one file", (option) => {
    expect(run(`head ${option} -n 1 short.txt`).events).toEqual([
      stdout("==> short.txt <==\none\n"),
    ]);
  });

  test("the last of -q and -v wins", () => {
    expect(run("head -v -q -n 1 short.txt").events).toEqual([stdout("one\n")]);
    expect(run("head -q -v -n 1 short.txt").events).toEqual([stdout("==> short.txt <==\none\n")]);
  });

  test("a header comes even for an empty file", () => {
    expect(run("head empty.txt short.txt").events).toEqual([
      stdout("==> empty.txt <==\n\n==> short.txt <==\none\ntwo\n"),
    ]);
  });
});

describe("head with standard input", () => {
  test("reads standard input without operands", () => {
    expect(run("cat numbers.txt | head -n 2").events).toEqual([stdout(first(2))]);
  });

  test("reads standard input for -", () => {
    expect(run("head -n 1 - < short.txt").events).toEqual([stdout("one\n")]);
  });

  test("names standard input in the header", () => {
    expect(run("cat short.txt | head -n 1 - numbers.txt").events).toEqual([
      stdout("==> standard input <==\none\n\n==> numbers.txt <==\n1\n"),
    ]);
  });

  test("a second - of a file from < goes on where the first stopped", () => {
    expect(run("head -n 1 - - < short.txt").events).toEqual([
      stdout("==> standard input <==\none\n\n==> standard input <==\ntwo\n"),
    ]);
  });

  test("a second - of a file from < goes on after the bytes head wrote", () => {
    expect(run("head -c 2 - - < short.txt").events).toEqual([
      stdout("==> standard input <==\non\n==> standard input <==\ne\n"),
    ]);
  });

  test("after -n -N, a second - of a file from < starts at the bytes left out", () => {
    expect(run("head -n -1 - - < short.txt").events).toEqual([
      stdout("==> standard input <==\none\n\n==> standard input <==\n"),
    ]);
  });

  test("a pipe loses the rest of the buffer that head read for its lines", () => {
    expect(run("cat short.txt | head -n 1 - -").events).toEqual([
      stdout("==> standard input <==\none\n\n==> standard input <==\n"),
    ]);
  });

  test("@differential a pipe gives head its text in reads of 8192 bytes", () => {
    const result = run("cat long.txt | head -n 1 - -");
    const after = LONG.slice(8192, 8200);
    expect(result.events).toEqual([
      stdout(`==> standard input <==\n000000000\n\n==> standard input <==\n${after}`),
    ]);
  });

  test("a pipe keeps the rest after -c, which reads only the bytes it writes", () => {
    expect(run("cat short.txt | head -c 4 - -").events).toEqual([
      stdout("==> standard input <==\none\n\n==> standard input <==\ntwo\n"),
    ]);
  });

  test("after -n -N, a pipe is read to its end", () => {
    expect(run("cat short.txt | head -n -1 - -").events).toEqual([
      stdout("==> standard input <==\none\n\n==> standard input <==\n"),
    ]);
  });

  test("a directory as standard input cannot be read", () => {
    const result = run("head < docs");
    expect(result.events).toEqual([
      stderr("head: error reading 'standard input': Is a directory\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("the terminal stops the input with a notice, after the output before it", () => {
    const result = run("head short.txt -; echo next");
    expect(result.events).toEqual([
      stdout("==> short.txt <==\none\ntwo\n\n==> standard input <==\n"),
      { kind: "notice", command: "head", notice: { key: "terminal-input-not-simulated" } },
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("the terminal is not read for zero lines", () => {
    const result = run("head -n 0");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("a directory is not read when all but an unlimited number is left out", () => {
    expect(run("head -c -99999999999999999999 < docs").session.exitStatus).toBe(0);
  });
});

describe("head: obsolete options", () => {
  test.each([
    ["head -3 numbers.txt", first(3)],
    ["head -3l numbers.txt", first(3)],
    ["head -5c numbers.txt", "1\n2\n3"],
    ["head -1b numbers.txt", NUMBERS],
    ["head -1k numbers.txt", NUMBERS],
    ["head -1m numbers.txt", NUMBERS],
    ["head -5cl numbers.txt", first(5)],
    ["head -2 -n 1 numbers.txt", first(1)],
  ])("%s", (input, text) => {
    expect(run(input).events).toEqual([stdout(text)]);
  });

  test("q, v and z work like their options", () => {
    expect(run("head -1v short.txt").events).toEqual([stdout("==> short.txt <==\none\n")]);
    expect(run("head -1q short.txt numbers.txt").events).toEqual([stdout("one\n1\n")]);
    expect(run("head -2z zero.txt").events).toEqual([stdout("a\0b\0")]);
  });

  test("an unknown letter is an error", () => {
    const result = run("head -3x numbers.txt");
    expect(result.events).toEqual([stderr(`head: invalid trailing option -- x\n${TRY_HELP}`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a digit as a later option is an error", () => {
    expect(run("head numbers.txt -3").events).toEqual([
      stderr(`head: invalid trailing option -- 3\n${TRY_HELP}`),
    ]);
    expect(run("head -q5").events).toEqual([
      stderr(`head: invalid trailing option -- 5\n${TRY_HELP}`),
    ]);
  });
});

describe("head: errors", () => {
  test.each([
    ["missing.txt", "No such file or directory"],
    ["short.txt/x", "Not a directory"],
    ["secret.txt", "Permission denied"],
    ["/srv/closed/inside.txt", "Permission denied"],
  ])("%s cannot be opened: %s", (operand, message) => {
    const result = run(`head ${operand}`);
    expect(result.events).toEqual([
      stderr(`head: cannot open '${operand}' for reading: ${message}\n`),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a file that cannot be opened gets no header, and head goes on", () => {
    const result = run("head -n 1 missing.txt short.txt");
    expect(result.events).toEqual([
      stderr("head: cannot open 'missing.txt' for reading: No such file or directory\n"),
      stdout("==> short.txt <==\none\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a directory gets its header, then the read fails", () => {
    const result = run("head -n 1 docs short.txt");
    expect(result.events).toEqual([
      stdout("==> docs <==\n"),
      stderr("head: error reading 'docs': Is a directory\n"),
      stdout("\n==> short.txt <==\none\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a directory is not read for zero bytes", () => {
    expect(run("head -c 0 docs").session.exitStatus).toBe(0);
  });

  test("a directory cannot be read when head leaves out its end", () => {
    expect(run("head -n -1 docs").events).toEqual([
      stderr("head: error reading 'docs': Is a directory\n"),
    ]);
  });

  test.each([
    ["-n abc", "invalid number of lines: ‘abc’"],
    ["-n ''", "invalid number of lines: ‘’"],
    ["-n 5x", "invalid number of lines: ‘5x’"],
    ["-n --5", "invalid number of lines: ‘-5’"],
    ["-c 1.5", "invalid number of bytes: ‘1.5’"],
    ["--bytes=-k-", "invalid number of bytes: ‘k-’"],
  ])("head %s: %s", (options, message) => {
    const result = run(`head ${options} short.txt`);
    expect(result.events).toEqual([stderr(`head: ${message}\n`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("an invalid count comes before a later usage error", () => {
    expect(run("head -n abc -x").events).toEqual([
      stderr("head: invalid number of lines: ‘abc’\n"),
    ]);
  });

  test.each([
    ["head -x", "head: invalid option -- 'x'\n"],
    ["head -n", "head: option requires an argument -- 'n'\n"],
    ["head --v", "head: option '--v' is ambiguous; possibilities: '--verbose' '--version'\n"],
  ])("%s is a usage error with exit status 1", (input, message) => {
    const result = run(input);
    expect(result.events).toEqual([stderr(message + TRY_HELP)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test.each([
    ["head --help", "--help"],
    ["head --version", "--version"],
    ["head ---presume-input-pipe short.txt", "---presume-input-pipe"],
  ])("%s gives a notice", (input, option) => {
    expect(run(input).events).toEqual([
      { kind: "notice", command: "head", notice: { key: "option-not-simulated", option } },
    ]);
  });
});
