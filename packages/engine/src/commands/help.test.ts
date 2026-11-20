import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { runScript, type ScriptResult, type ShellEvent } from "../interpreter";
import { parse } from "../parser";
import { createSession } from "../session";
import { buildWorld } from "../world-builder";
import { COMMANDS } from ".";
import { createHelp } from "./help";

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

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

describe("help", () => {
  test("shows the game's overview without operands", () => {
    const result = run("help");
    expect(result.events).toEqual([{ kind: "game-output", output: { kind: "help" } }]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("describes every simulated command and game command, itself included", () => {
    for (const { name } of COMMANDS) {
      const result = run(`help ${name}`);
      expect(result.events).toEqual([
        { kind: "game-output", output: { kind: "help-topic", topic: name } },
      ]);
      expect(result.session.exitStatus).toBe(0);
    }
  });

  test("says that it does not know a name and fails when no operand is known", () => {
    const result = run("help nano");
    expect(result.events).toEqual([
      { kind: "game-output", output: { kind: "help-unknown", topic: "nano" } },
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("shows every operand in order and succeeds when one is known", () => {
    const result = run("help nano ls; echo $?");
    expect(result.events).toEqual([
      { kind: "game-output", output: { kind: "help-unknown", topic: "nano" } },
      { kind: "game-output", output: { kind: "help-topic", topic: "ls" } },
      { kind: "output", stream: "stdout", text: "0\n" },
    ]);
  });

  test("reads operands after `--` and after expansion", () => {
    const result = run("name=pwd; help -- $name");
    expect(result.events).toEqual([
      { kind: "game-output", output: { kind: "help-topic", topic: "pwd" } },
    ]);
  });

  test("stops at bash's options, which the game does not simulate", () => {
    for (const [input, option] of [
      ["help -d ls", "-d"],
      ["help -s ls", "-s"],
      ["help -m ls", "-m"],
      ["help --help", "--help"],
    ] as const) {
      const result = run(input);
      expect(result.events).toEqual([
        {
          kind: "notice",
          command: "help",
          notice: { key: "option-not-simulated", option },
        },
      ]);
      expect(result.session.exitStatus).toBe(1);
    }
  });

  test("gives bash's usage error for an invalid option", () => {
    const result = run("help -x");
    expect(result.events).toEqual([
      stderr("bash: help: -x: invalid option\nhelp: usage: help [-dms] [pattern ...]\n"),
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("stops with a notice when its output goes to a pipe or a file", () => {
    for (const input of ["help | cat", "help ls > out.txt"]) {
      const result = run(input);
      expect(result.events).toEqual([
        { kind: "notice", command: "help", notice: { key: "game-output-not-simulated" } },
      ]);
      expect(result.session.exitStatus).toBe(1);
    }
  });

  test("asks its topic test for every operand", () => {
    const asked: string[] = [];
    const help = createHelp((name) => {
      asked.push(name);
      return name === "known";
    });
    const result = runScript({
      world,
      session: alice,
      script: (() => {
        const parsed = parse("help known other");
        if (!parsed.ok) {
          throw new Error("does not parse");
        }
        return parsed.script;
      })(),
      commands: createCommandLookup([help]),
      clock: createGameClock(START),
      terminal: { columns: 80 },
    });
    expect(asked).toEqual(["known", "other"]);
    expect(result.events).toEqual([
      { kind: "game-output", output: { kind: "help-topic", topic: "known" } },
      { kind: "game-output", output: { kind: "help-unknown", topic: "other" } },
    ]);
  });
});
