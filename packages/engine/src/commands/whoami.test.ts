import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import { toUid } from "../ids";
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
        groups: [
          { name: "root", gid: 0 },
          { name: "alice", gid: 1000 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "alice", uid: 1000 },
        ],
      },
    ],
  },
  createGameClock(START),
);

const alice = createSession(world, "ws01", "alice");
const root = createSession(world, "ws01", "root");

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

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

const TRY_HELP = "Try 'whoami --help' for more information.\n";

describe("whoami", () => {
  test("writes the name of the session's user", () => {
    const result = run("whoami");
    expect(result.events).toEqual([stdout("alice\n")]);
    expect(result.session.exitStatus).toBe(0);
    expect(run("whoami", root).events).toEqual([stdout("root\n")]);
  });

  test("`--` alone is no operand", () => {
    expect(run("whoami --").events).toEqual([stdout("alice\n")]);
  });

  test("its output goes through a pipe", () => {
    expect(run("whoami | whoami").events).toEqual([stdout("alice\n")]);
  });

  test("a user ID without a user is an error", () => {
    const deleted: Session = {
      ...alice,
      credentials: { ...alice.credentials, uid: toUid(1005) },
    };
    const result = run("whoami", deleted);
    expect(result.events).toEqual([stderr("whoami: cannot find name for user ID 1005\n")]);
    expect(result.session.exitStatus).toBe(1);
  });

  test.each([
    ["whoami bob", "whoami: extra operand ‘bob’\n"],
    ["whoami bob carol", "whoami: extra operand ‘bob’\n"],
    ["whoami -- -x", "whoami: extra operand ‘-x’\n"],
    ["whoami -x", "whoami: invalid option -- 'x'\n"],
    ["whoami bob -x", "whoami: invalid option -- 'x'\n"],
    ["whoami --user", "whoami: unrecognized option '--user'\n"],
  ])("@differential %s is a usage error with exit status 1", (input, message) => {
    const result = run(input);
    expect(result.events).toEqual([stderr(message + TRY_HELP)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test.each([
    ["whoami --help", "--help"],
    ["whoami --vers", "--version"],
    ["whoami bob --help", "--help"],
  ])("%s stops the input with a game notice", (input, option) => {
    expect(run(input).events).toEqual([
      { kind: "notice", command: "whoami", notice: { key: "option-not-simulated", option } },
    ]);
  });
});
