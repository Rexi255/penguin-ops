import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { runScript, type ScriptResult } from "../interpreter";
import { parse } from "../parser";
import { createSession } from "../session";
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
        files: { "/home/alice/": {} },
      },
    ],
  },
  createGameClock(START),
);

const alice = createSession(world, "ws01", "alice");

const commands = createCommandLookup(COMMANDS);

function run(input: string): ScriptResult {
  const parsed = parse(input);
  if (!parsed.ok) {
    throw new Error(`test input does not parse: ${input}`);
  }
  return runScript({
    world,
    session: alice,
    script: parsed.script,
    commands,
    clock: createGameClock(START),
    terminal: { columns: 80 },
  });
}

/** The standard output of `input`; fails if there are other events. */
function output(input: string): string {
  const result = run(input);
  expect(result.session.exitStatus).toBe(0);
  const [event, ...more] = result.events;
  expect(more).toEqual([]);
  if (event === undefined) {
    return "";
  }
  expect(event).toMatchObject({ kind: "output", stream: "stdout" });
  return event.kind === "output" ? event.text : "";
}

describe("echo", () => {
  test.each([
    ["echo hello world", "hello world\n"],
    ["echo", "\n"],
    ["echo '  spaced  '   out", "  spaced   out\n"],
    ["echo a '' b", "a  b\n"],
    ["echo 'a\\tb'", "a\\tb\n"],
    ["echo hi -n", "hi -n\n"],
  ])("%s", (input, expected) => {
    expect(output(input)).toBe(expected);
  });

  test("its output goes through a pipe and into files", () => {
    const result = run("echo first > note.txt; echo second >> note.txt; echo piped | echo last");
    expect(result.events).toEqual([{ kind: "output", stream: "stdout", text: "last\n" }]);
    const home = result.world.hosts[0]?.root.entries.get("home");
    const aliceHome = home?.kind === "directory" ? home.entries.get("alice") : undefined;
    const note = aliceHome?.kind === "directory" ? aliceHome.entries.get("note.txt") : undefined;
    expect(note).toMatchObject({ kind: "file", content: "first\nsecond\n" });
  });
});

describe("echo options", () => {
  test.each([
    ["echo -n hi", "hi"],
    ["echo -n", ""],
    ["echo -n -n a b", "a b"],
    ["echo -nE 'a\\tb'", "a\\tb"],
    ["echo -e 'a\\tb'", "a\tb\n"],
    ["echo -ne 'a\\tb'", "a\tb"],
    ["echo -eE 'a\\tb'", "a\\tb\n"],
    ["echo -Ee 'a\\tb'", "a\tb\n"],
    ["echo -e -E 'a\\tb'", "a\\tb\n"],
  ])("%s", (input, expected) => {
    expect(output(input)).toBe(expected);
  });

  test.each([
    ["echo -x hi", "-x hi\n"],
    ["echo -nx hi", "-nx hi\n"],
    ["echo - hi", "- hi\n"],
    ["echo -- hi", "-- hi\n"],
    ["echo --help", "--help\n"],
    ["echo -n -- -n", "-- -n"],
    ["echo -n hi -e", "hi -e"],
  ])("%s is text from the first word that is not an option", (input, expected) => {
    expect(output(input)).toBe(expected);
  });
});

describe("echo -e escapes", () => {
  test.each([
    ["\\a\\b\\f\\v", "\x07\b\f\v"],
    ["\\e\\E", "\x1b\x1b"],
    ["a\\nb\\rc\\td", "a\nb\rc\td"],
    ["back\\\\slash", "back\\slash"],
    ["\\0101\\0", "A\0"],
    ["\\08", "\x008"],
    ["\\01012", "A2"],
    ["\\0400", "\0"],
    ["\\101", "\\101"],
    ["\\x41\\x4\\x414", "A\x04A4"],
    ["\\xg", "\\xg"],
    ["\\u00e4\\u41\\U0001F600", "ä" + "A" + "😀"],
    ["\\u", "\\u"],
    ["\\Ux", "\\Ux"],
    ["\\q\\'\\\"\\?", "\\q\\'\\\"\\?"],
    ["end\\", "end\\"],
    ["\\xc3\\xa4", "ä"],
    ["\\0303\\0244", "ä"],
    ["x\\uffffy", "x￿y"],
  ])("'%s'", (argument, expected) => {
    expect(output(`echo -ne '${argument.replaceAll("'", "'\\''")}'`)).toBe(expected);
  });

  test("`\\c` ends all output, also the line break", () => {
    expect(output("echo -e 'one\\ctwo' three")).toBe("one");
    expect(output("echo -e first 'sec\\c' third")).toBe("first sec");
  });

  test("an empty word still gets its spaces", () => {
    expect(output("echo -e a '' b")).toBe("a  b\n");
  });

  test.each(["\\xff", "\\xc3", "\\0377", "\\ud800", "\\U00110000", "a\\xe2\\x82"])(
    "'%s' would not be valid UTF-8 and stops the input with a game notice",
    (argument) => {
      const result = run(`echo first; echo -e '${argument}'; echo never`);
      expect(result.events).toEqual([
        { kind: "output", stream: "stdout", text: "first\n" },
        { kind: "notice", command: "echo", notice: { key: "invalid-utf8-not-simulated" } },
      ]);
      expect(result.session.exitStatus).toBe(1);
    },
  );

  test("invalid bytes after `\\c` are never written and do not matter", () => {
    expect(output("echo -e 'ok\\c\\xff' '\\xff'")).toBe("ok");
  });
});
