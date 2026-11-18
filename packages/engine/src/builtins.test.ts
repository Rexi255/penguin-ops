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

/** Writes what it got: its option letters, the option arguments, then its operands. */
function report({ options, optionArguments, operands, stdout }: BuiltinInvocation): CommandResult {
  const values = [...optionArguments].map(([letter, value]) => `${letter}=${value}`);
  stdout(
    `options [${options.join(",")}] arguments [${values.join(",")}] ` +
      `operands [${operands.join(",")}]\n`,
  );
  return { exitStatus: 0 };
}

/** A builtin like `cd` whose `-@` the game does not simulate, with `-d` taking an argument. */
const go = defineBuiltin({
  name: "go",
  options: ["e", "L", "P", "@", "d"],
  simulated: ["e", "L", "P", "d"],
  withArgument: ["d"],
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
  return { kind: "notice", command: "go", notice: { key: "option-not-simulated", option } };
}

describe("parseBuiltinOptions", () => {
  const letters = ["L", "P"];

  test("reads options in single words and clusters until the first operand", () => {
    expect(parseBuiltinOptions(["-L", "-PL", "dir", "-P"], letters)).toEqual({
      kind: "parsed",
      options: ["L", "P", "L"],
      optionArguments: new Map(),
      operands: ["dir", "-P"],
    });
  });

  test("a lone dash is an operand and ends the options", () => {
    expect(parseBuiltinOptions(["-", "-L"], letters)).toEqual({
      kind: "parsed",
      options: [],
      optionArguments: new Map(),
      operands: ["-", "-L"],
    });
  });

  test("`--` ends the options and is dropped", () => {
    expect(parseBuiltinOptions(["-P", "--", "-L"], letters)).toEqual({
      kind: "parsed",
      options: ["P"],
      optionArguments: new Map(),
      operands: ["-L"],
    });
  });

  test("no arguments give no options and no operands", () => {
    expect(parseBuiltinOptions([], letters)).toEqual({
      kind: "parsed",
      options: [],
      optionArguments: new Map(),
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
      optionArguments: new Map(),
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

  test("an option with an argument takes the rest of its word", () => {
    expect(parseBuiltinOptions(["-Ld5", "x"], ["L", "d"], ["d"])).toEqual({
      kind: "parsed",
      options: ["L", "d"],
      optionArguments: new Map([["d", "5"]]),
      operands: ["x"],
    });
  });

  test("an option with an argument at the end of its word takes the next word as it is", () => {
    expect(parseBuiltinOptions(["-d", "-1", "-L", "x"], ["L", "d"], ["d"])).toEqual({
      kind: "parsed",
      options: ["d", "L"],
      optionArguments: new Map([["d", "-1"]]),
      operands: ["x"],
    });
    expect(parseBuiltinOptions(["-d", "--"], ["d"], ["d"])).toEqual({
      kind: "parsed",
      options: ["d"],
      optionArguments: new Map([["d", "--"]]),
      operands: [],
    });
  });

  test("the last argument of an option given twice wins", () => {
    expect(parseBuiltinOptions(["-d1", "-d", "2"], ["d"], ["d"])).toEqual({
      kind: "parsed",
      options: ["d", "d"],
      optionArguments: new Map([["d", "2"]]),
      operands: [],
    });
  });

  test("an option with an argument as the last word misses its argument", () => {
    expect(parseBuiltinOptions(["-L", "-Ld"], ["L", "d"], ["d"])).toEqual({
      kind: "missing-argument",
      option: "-d",
      options: ["L", "L", "d"],
    });
  });

  test("the argument may start with a multi-unit character", () => {
    expect(parseBuiltinOptions(["-d😀"], ["d"], ["d"])).toEqual({
      kind: "parsed",
      options: ["d"],
      optionArguments: new Map([["d", "😀"]]),
      operands: [],
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
    expect(run("go -LP -e dir").events).toEqual([
      stdout("options [L,P,e] arguments [] operands [dir]\n"),
    ]);
  });

  test("the builtin gets the arguments of its options", () => {
    expect(run("go -Ld 5 dir").events).toEqual([
      stdout("options [L,d] arguments [d=5] operands [dir]\n"),
    ]);
  });

  test("a missing option argument gives bash's message, the usage line and exit status 2", () => {
    const result = run("go -L -d");
    expect(result.events).toEqual([
      stderr(
        "bash: go: -d: option requires an argument\n" + "go: usage: go [-L|[-P [-e]] [-@]] [dir]\n",
      ),
    ]);
    expect(result.session.exitStatus).toBe(BUILTIN_USAGE_STATUS);
  });

  test("an unsimulated option before a missing argument wins", () => {
    expect(run("go -@d").events).toEqual([notice("-@")]);
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
      ["an unknown letter with an argument", { withArgument: ["x"] }, 'gives "-x" an argument'],
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
