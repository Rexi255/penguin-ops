import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { runScript, type ScriptResult, type ShellEvent } from "../interpreter";
import { lookup } from "../lookup";
import { parse } from "../parser";
import { createSession, type Session } from "../session";
import { findHost, type World } from "../world";
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
        files: { "/home/alice/notes.txt": "" },
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

function contentOf(current: World, path: string): string | undefined {
  const host = findHost(current, "ws01");
  const found = host && lookup(host.root, alice.credentials, "/", path);
  return found?.ok === true && found.node.kind === "file" ? found.node.content : undefined;
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

const CLEARED: ShellEvent = { kind: "clear-screen", clearsScrollback: true };

const USAGE =
  "Usage: clear [options]\n" +
  "\n" +
  "Options:\n" +
  "  -T TERM     use this instead of $TERM\n" +
  "  -V          print curses-version\n" +
  "  -x          do not try to clear scrollback\n";

describe("clear", () => {
  test("clears the screen and the scrollback of the terminal", () => {
    const result = run("clear");
    expect(result.events).toEqual([CLEARED]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("-x keeps the scrollback", () => {
    expect(run("clear -x").events).toEqual([{ kind: "clear-screen", clearsScrollback: false }]);
    expect(run("clear -xx").events).toEqual([{ kind: "clear-screen", clearsScrollback: false }]);
  });

  test("clears at its place among the output of other commands", () => {
    expect(run("whoami; clear; whoami").events).toEqual([
      stdout("alice\n"),
      CLEARED,
      stdout("alice\n"),
    ]);
  });

  test("`--` alone is no operand", () => {
    expect(run("clear --").events).toEqual([CLEARED]);
    expect(run("clear -x --").events).toEqual([{ kind: "clear-screen", clearsScrollback: false }]);
  });

  test("redirecting standard error keeps the terminal", () => {
    expect(run("clear 2> /home/alice/errors").events).toEqual([CLEARED]);
  });

  test("into a file it writes the escape sequences of xterm-256color", () => {
    const result = run("clear > /home/alice/screen; clear -x >> /home/alice/screen");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(contentOf(result.world, "/home/alice/screen")).toBe(
      "\u001b[H\u001b[2J\u001b[3J\u001b[H\u001b[2J",
    );
  });

  test("into a pipe it writes the escape sequences and clears nothing", () => {
    const result = run("clear | whoami");
    expect(result.events).toEqual([stdout("alice\n")]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("@differential -V writes the curses version, also before later errors and operands", () => {
    for (const input of [
      "clear -V",
      "clear -xV",
      "clear -V -z",
      "clear screen -V",
      "TERM= clear -V",
    ]) {
      const result = run(input);
      expect(result.events).toEqual([stdout("ncurses 6.5.20250216\n")]);
      expect(result.session.exitStatus).toBe(0);
    }
  });

  describe("usage errors", () => {
    test.each([
      ["clear screen", ""],
      ["clear -x screen", ""],
      ["clear -- -x", ""],
      ["clear -z", "clear: invalid option -- 'z'\n"],
      ["clear screen -z", "clear: invalid option -- 'z'\n"],
      ["clear -xz", "clear: invalid option -- 'z'\n"],
      ["clear -z -V", "clear: invalid option -- 'z'\n"],
      ["clear --help", "clear: invalid option -- '-'\n"],
      ["clear -x --version", "clear: invalid option -- '-'\n"],
      ["clear -T", "clear: option requires an argument -- 'T'\n"],
      ["clear -z -T xterm", "clear: invalid option -- 'z'\n"],
      ["TERM= clear screen", ""],
    ])("%s writes the usage with exit status 1", (input, message) => {
      const result = run(input);
      expect(result.events).toEqual([stderr(message + USAGE)]);
      expect(result.session.exitStatus).toBe(1);
    });
  });

  describe("the terminal type", () => {
    test("an empty TERM is an error", () => {
      const result = run("TERM= clear");
      expect(result.events).toEqual([stderr("TERM environment variable not set.\n")]);
      expect(result.session.exitStatus).toBe(1);
    });

    test("a missing TERM is an error", () => {
      const variables = new Map(alice.variables);
      variables.delete("TERM");
      const result = run("clear", { ...alice, variables });
      expect(result.events).toEqual([stderr("TERM environment variable not set.\n")]);
      expect(result.session.exitStatus).toBe(1);
    });

    test("TERM=xterm-256color before the command works like the session's TERM", () => {
      expect(run("TERM=xterm-256color clear").events).toEqual([CLEARED]);
    });

    test.each(["TERM=dumb clear", "TERM=linux clear -x", "TERM=vt100 clear > /home/alice/screen"])(
      "another terminal type stops the input with a game notice: %s",
      (input) => {
        expect(run(input).events).toEqual([
          {
            kind: "notice",
            command: "clear",
            notice: { key: "variable-not-simulated", variable: "TERM" },
          },
        ]);
      },
    );
  });

  test.each(["clear -T xterm", "clear -Txterm", "clear -x -T xterm screen", "clear -T xterm -z"])(
    "%s stops the input with a game notice",
    (input) => {
      expect(run(input).events).toEqual([
        { kind: "notice", command: "clear", notice: { key: "option-not-simulated", option: "-T" } },
      ]);
    },
  );
});
