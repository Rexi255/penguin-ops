import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { runScript, type ScriptResult, type ShellEvent } from "../interpreter";
import { parse } from "../parser";
import { createSession, type Session } from "../session";
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
        files: {
          "/home/alice/": {},
          "/srv/locked/": { mode: 0o700 },
          "/srv/locked/inner/": {},
          "/tmp/": { mode: 0o1777 },
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
  });
}

/** `session` with the working directory `cwd`, as bash remembers it. */
function inDirectory(session: Session, cwd: string): Session {
  return { ...session, cwd };
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

const GETCWD_FAILED =
  "pwd: error retrieving current directory: getcwd: cannot access parent directories: " +
  "No such file or directory\n";

describe("pwd", () => {
  test("writes the working directory", () => {
    const result = run("pwd");
    expect(result.events).toEqual([stdout("/home/alice\n")]);
    expect(result.session.exitStatus).toBe(0);
  });

  test.each(["pwd -L", "pwd -P", "pwd -LP", "pwd -PL", "pwd -- extra", "pwd extra -x"])(
    "%s writes it too",
    (input) => {
      expect(run(input).events).toEqual([stdout("/home/alice\n")]);
    },
  );

  test("follows cd", () => {
    expect(run("cd /tmp; pwd").events).toEqual([stdout("/tmp\n")]);
  });

  test("ignores an assignment to PWD", () => {
    expect(run("PWD=/elsewhere; pwd").events).toEqual([stdout("/home/alice\n")]);
  });

  test("its output goes through a pipe and into files", () => {
    const result = run("pwd > /tmp/where.txt; pwd -P | pwd");
    expect(result.events).toEqual([stdout("/home/alice\n")]);
    const tmp = result.world.hosts[0]?.root.entries.get("tmp");
    const file = tmp?.kind === "directory" ? tmp.entries.get("where.txt") : undefined;
    expect(file).toMatchObject({ kind: "file", content: "/home/alice\n" });
  });

  test("an invalid option gives the usage line and exit status 2", () => {
    const result = run("pwd -x");
    expect(result.events).toEqual([
      stderr("bash: pwd: -x: invalid option\npwd: usage: pwd [-LP]\n"),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("`--help` stops the input with a game notice", () => {
    expect(run("pwd --help").events).toEqual([
      { kind: "notice", command: "pwd", notice: { key: "option-not-simulated", option: "--help" } },
    ]);
  });
});

describe("pwd with a leading `//`", () => {
  const doubleSlash = inDirectory(alice, "//tmp");

  test("writes it with and without -P", () => {
    expect(run("pwd; pwd -P", doubleSlash).events).toEqual([stdout("//tmp\n//tmp\n")]);
  });

  test("@differential -P asks the kernel when a step on the way may not be searched", () => {
    const result = run("pwd -P", inDirectory(alice, "//srv/locked/inner"));
    expect(result.events).toEqual([stdout("/srv/locked/inner\n")]);
    // Bash remembers the kernel's answer.
    expect(result.session.cwd).toBe("/srv/locked/inner");
  });
});

describe("pwd in a directory that was removed", () => {
  const removed = inDirectory(alice, "/home/alice/gone");

  test("writes the remembered name without -P", () => {
    expect(run("pwd; pwd -PL", removed).events).toEqual([
      stdout("/home/alice/gone\n/home/alice/gone\n"),
    ]);
  });

  test("-P fails because getcwd fails", () => {
    const result = run("pwd -P", removed);
    expect(result.events).toEqual([stderr(GETCWD_FAILED)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("-P fails also when a parent directory was removed", () => {
    expect(run("pwd -LP", inDirectory(alice, "/gone/away")).events).toEqual([
      stderr(GETCWD_FAILED),
    ]);
  });
});
