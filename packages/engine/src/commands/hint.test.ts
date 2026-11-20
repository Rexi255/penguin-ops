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
        files: { "/home/alice/notes.txt": "" },
      },
    ],
  },
  createGameClock(START),
);

const alice = createSession(world, "ws01", "alice");

function run(input: string): ScriptResult {
  const parsed = parse(input);
  if (!parsed.ok) {
    throw new Error(`test input does not parse: ${input}`);
  }
  return runScript({
    world,
    session: alice,
    script: parsed.script,
    commands: createCommandLookup(COMMANDS),
    clock: createGameClock(START),
    terminal: { columns: 80 },
  });
}

describe("hint", () => {
  test("asks for the next hint", () => {
    const result = run("hint");
    expect(result.events).toEqual([{ kind: "game-output", output: { kind: "hint" } }]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("asks once for every hint of an input, in order with other output", () => {
    const result = run("hint; echo between; hint");
    expect(result.events).toEqual([
      { kind: "game-output", output: { kind: "hint" } },
      { kind: "output", stream: "stdout", text: "between\n" },
      { kind: "game-output", output: { kind: "hint" } },
    ]);
  });

  test("refuses operands like a builtin without arguments", () => {
    const result = run("hint please");
    expect(result.events).toEqual([
      { kind: "output", stream: "stderr", text: "bash: hint: too many arguments\n" },
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("gives bash's usage error for an option", () => {
    const result = run("hint -a");
    expect(result.events).toEqual([
      {
        kind: "output",
        stream: "stderr",
        text: "bash: hint: -a: invalid option\nhint: usage: hint\n",
      },
    ]);
    expect(result.session.exitStatus).toBe(2);
  });

  test("stops with a notice when its output goes to a pipe or a file", () => {
    for (const input of ["hint | cat", "hint > out.txt"]) {
      const result = run(input);
      expect(result.events).toEqual([
        { kind: "notice", command: "hint", notice: { key: "game-output-not-simulated" } },
      ]);
      expect(result.session.exitStatus).toBe(1);
    }
  });

  test("shows its text when only its standard error is redirected", () => {
    const result = run("hint 2> errors.txt");
    expect(result.events).toEqual([{ kind: "game-output", output: { kind: "hint" } }]);
  });
});
