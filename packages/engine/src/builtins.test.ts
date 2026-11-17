import { describe, expect, test } from "vitest";

import {
  BUILTIN_USAGE_STATUS,
  type BuiltinDefinition,
  builtinError,
  type BuiltinInvocation,
  defineBuiltin,
  parseBuiltinOptions,
} from "./builtins";
import { createGameClock } from "./clock";
import { createCommandLookup } from "./command-registry";
import { type CommandResult, runScript, type ScriptResult, type ShellEvent } from "./interpreter";
import { parse } from "./parser";
import { createSession } from "./session";
import { buildWorld } from "./world-builder";

const START = 1_700_000_000_000;

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
  createGameClock(START),
);

const alice = createSession(world, "ws01", "alice");

/** Writes what it got: its option letters, then its operands. */
function report({ options, operands, stdout }: BuiltinInvocation): CommandResult {
  stdout(`options [${options.join(",")}] operands [${operands.join(",")}]\n`);
  return { exitStatus: 0 };
}

/** A builtin like `cd` whose `-@` the game does not simulate. */
const go = defineBuiltin({
  name: "go",
  options: ["e", "L", "P", "@"],
  simulated: ["e", "L", "P"],
  usage: "go [-L|[-P [-e]] [-@]] [dir]",
  run: report,
});

function run(input: string): ScriptResult {
  const parsed = parse(input);
  if (!parsed.ok) {
    throw new Error(`test input does not parse: ${input}`);
  }
  return runScript({
    world,
    session: alice,
    script: parsed.script,
    commands: createCommandLookup([go]),
    clock: createGameClock(START),
  });
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

function notice(option: string): ShellEvent {
  return { kind: "notice", command: "go", notice: { key: "option-not-simulated", option } };
}

describe("parseBuiltinOptions", () => {
  const letters = ["L", "P"];

  test("reads options in single words and clusters until the first operand", () => {
    expect(parseBuiltinOptions(["-L", "-PL", "dir", "-P"], letters)).toEqual({
      kind: "parsed",
      options: ["L", "P", "L"],
      operands: ["dir", "-P"],
    });
  });

  test("a lone dash is an operand and ends the options", () => {
    expect(parseBuiltinOptions(["-", "-L"], letters)).toEqual({
      kind: "parsed",
      options: [],
      operands: ["-", "-L"],
    });
  });

  test("`--` ends the options and is dropped", () => {
    expect(parseBuiltinOptions(["-P", "--", "-L"], letters)).toEqual({
      kind: "parsed",
      options: ["P"],
      operands: ["-L"],
    });
  });

  test("no arguments give no options and no operands", () => {
    expect(parseBuiltinOptions([], letters)).toEqual({
      kind: "parsed",
      options: [],
      operands: [],
    });
  });

  test("`--help` as an option word asks for the help, with the options before it", () => {
    expect(parseBuiltinOptions(["-L", "--help", "-x"], letters)).toEqual({
      kind: "help",
      options: ["L"],
    });
  });

  test("`--help` after an operand is an operand", () => {
    expect(parseBuiltinOptions(["dir", "--help"], letters)).toEqual({
      kind: "parsed",
      options: [],
      operands: ["dir", "--help"],
    });
  });

  test("an unknown letter is an invalid option, with the options before it", () => {
    expect(parseBuiltinOptions(["-L", "-Px", "-y"], letters)).toEqual({
      kind: "invalid",
      option: "-x",
      options: ["L", "P"],
    });
  });

  test("any other word starting with `--` is the invalid option `--`", () => {
    expect(parseBuiltinOptions(["--version"], letters)).toEqual({
      kind: "invalid",
      option: "--",
      options: [],
    });
    expect(parseBuiltinOptions(["--hel"], letters)).toEqual({
      kind: "invalid",
      option: "--",
      options: [],
    });
  });

  test("a multi-unit character is one invalid option", () => {
    expect(parseBuiltinOptions(["-😀"], letters)).toEqual({
      kind: "invalid",
      option: "-😀",
      options: [],
    });
  });
});

describe("defineBuiltin", () => {
  test("the builtin gets its simulated options and its operands", () => {
    expect(run("go -LP -e dir").events).toEqual([stdout("options [L,P,e] operands [dir]\n")]);
  });

  test("an invalid option gives bash's message, the usage line and exit status 2", () => {
    const result = run("go -Lx dir; echo-status");
    expect(result.events).toEqual([
      stderr(
        "bash: go: -x: invalid option\n" +
          "go: usage: go [-L|[-P [-e]] [-@]] [dir]\n" +
          "bash: echo-status: command not found\n",
      ),
    ]);
    expect(run("go --nope").session.exitStatus).toBe(BUILTIN_USAGE_STATUS);
  });

  test("an unsimulated option stops the input with a notice", () => {
    const result = run("go -L@ dir; go");
    expect(result.events).toEqual([notice("-@")]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("an unsimulated option before an invalid one wins", () => {
    expect(run("go -@x").events).toEqual([notice("-@")]);
  });

  test("an invalid option before an unsimulated one wins", () => {
    expect(run("go -x@").events).toEqual([
      stderr("bash: go: -x: invalid option\ngo: usage: go [-L|[-P [-e]] [-@]] [dir]\n"),
    ]);
  });

  test("`--help` stops the input with a notice for `--help`", () => {
    expect(run("go -L --help").events).toEqual([notice("--help")]);
  });

  test("an unsimulated option before `--help` wins", () => {
    expect(run("go -@ --help").events).toEqual([notice("-@")]);
  });

  describe("rejects invalid definitions", () => {
    const valid: BuiltinDefinition = {
      name: "go",
      options: ["L", "P"],
      simulated: ["L"],
      usage: "go [-LP]",
      run: report,
    };

    test.each([
      ["an empty name", { name: "" }, '"" is not a valid command name'],
      ["a name with a slash", { name: "bin/go" }, '"bin/go" is not a valid command name'],
      ["a long option letter", { options: ["LP"] }, 'invalid option letter "LP"'],
      ["the letter `-`", { options: ["-"] }, 'invalid option letter "-"'],
      ["a letter twice", { options: ["L", "L"], simulated: [] }, 'has the option "-L" twice'],
      ["an unknown simulated letter", { simulated: ["x"] }, 'simulates "-x"'],
    ])("%s", (_case, change, message) => {
      expect(() => defineBuiltin({ ...valid, ...change })).toThrow(message);
    });
  });
});

describe("builtinError", () => {
  test("starts with bash and the builtin's name and ends with a newline", () => {
    expect(builtinError("cd", "HOME not set")).toBe("bash: cd: HOME not set\n");
  });
});
