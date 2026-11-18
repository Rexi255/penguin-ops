import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import {
  type CommandDefinition,
  type CommandInvocation,
  createCommandLookup,
  defineCommand,
  type RegisteredCommand,
} from "./command-registry";
import {
  type CommandLookup,
  type CommandResult,
  runScript,
  type ScriptResult,
  type ShellEvent,
} from "./interpreter";
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
        files: {},
      },
    ],
  },
  createGameClock(START),
);

const alice = createSession(world, "ws01", "alice");

/** Option ids of the test command `head`. */
type HeadOption = "bytes" | "lines" | "quiet" | "verbose" | "zero-terminated" | "help" | "version";

/** The option table of GNU `head` 9.7, in the order of its `long_options`. */
const headOptions: CommandDefinition<HeadOption>["options"] = [
  { id: "bytes", short: "c", long: "bytes", argument: "required" },
  { id: "lines", short: "n", long: "lines", argument: "required" },
  { id: "quiet", short: "q", long: "quiet", argument: "none" },
  { id: "quiet", long: "silent", argument: "none" },
  { id: "verbose", short: "v", long: "verbose", argument: "none" },
  { id: "zero-terminated", short: "z", long: "zero-terminated", argument: "none" },
  { id: "help", long: "help", argument: "none" },
  { id: "version", long: "version", argument: "none" },
];

/** Writes what it got: its options with their arguments, then its operands. */
function report({ options, operands, stdout }: CommandInvocation): CommandResult {
  for (const option of options) {
    stdout(`option ${option.id} ${option.name} ${option.argument ?? "-"}\n`);
  }
  for (const operand of operands) {
    stdout(`operand ${operand}\n`);
  }
  return { exitStatus: 0 };
}

/** A `head` that simulates `-n` and `-q`, and reports what it got. */
const head = defineCommand<HeadOption>({
  name: "head",
  options: headOptions,
  simulated: ["lines", "quiet"],
  usageErrorStatus: 1,
  run: report,
});

/** An `ls` with a small part of its table and a usage error status of 2. */
const ls = defineCommand({
  name: "ls",
  options: [
    { id: "all", short: "a", long: "all", argument: "none" },
    { id: "almost-all", short: "A", long: "almost-all", argument: "none" },
    { id: "context", short: "Z", long: "context", argument: "none" },
  ],
  simulated: ["all", "almost-all"],
  usageErrorStatus: 2,
  run: report,
});

/** A command that runs another command, so its options end at the first operand. */
const nice = defineCommand({
  name: "nice",
  options: [{ id: "adjustment", short: "n", long: "adjustment", argument: "required" }],
  simulated: ["adjustment"],
  order: "require-order",
  usageErrorStatus: 125,
  run: report,
});

/** A command without an option table, like `echo`. */
const plain: RegisteredCommand = {
  name: "plain",
  run: ({ args, stdout }) => {
    stdout(`${args.join(" ")}\n`);
    return { exitStatus: 0 };
  },
};

const commands = createCommandLookup([head, ls, nice, plain]);

function run(input: string, lookup: CommandLookup = commands): ScriptResult {
  const parsed = parse(input);
  if (!parsed.ok) {
    throw new Error(`test input does not parse: ${input}`);
  }
  return runScript({
    world,
    session: alice,
    script: parsed.script,
    commands: lookup,
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

function notice(command: string, option: string): ShellEvent {
  return { kind: "notice", command, notice: { key: "option-not-simulated", option } };
}

describe("defineCommand: simulated options", () => {
  test("the command gets its options in order and its operands", () => {
    const result = run("head -qn 3 a.txt --lines=5 -- -b");
    expect(result.events).toEqual([
      stdout(
        "option quiet -q -\n" +
          "option lines -n 3\n" +
          "option lines --lines 5\n" +
          "operand a.txt\n" +
          "operand -b\n",
      ),
    ]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("the command gets aliases and abbreviations by their id and full name", () => {
    expect(run("head --sil --li 2").events).toEqual([
      stdout("option quiet --silent -\noption lines --lines 2\n"),
    ]);
  });

  test("the command gets the order of its definition", () => {
    expect(run("nice -n 5 head -v").events).toEqual([
      stdout("option adjustment -n 5\noperand head\noperand -v\n"),
    ]);
  });

  test("the command's result is the result of the input", () => {
    const failing = defineCommand({
      name: "failing",
      options: [],
      simulated: [],
      usageErrorStatus: 1,
      run: () => ({ exitStatus: 3 }),
    });
    const result = run("failing", createCommandLookup([failing]));
    expect(result.session.exitStatus).toBe(3);
  });
});

describe("defineCommand: options the game does not simulate", () => {
  test("stop the input with a notice, without running the command", () => {
    const result = run("head -v a.txt; plain no");
    expect(result.events).toEqual([notice("head", "-v")]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("are named by their full name, also when abbreviated", () => {
    expect(run("head --verb").events).toEqual([notice("head", "--verbose")]);
    expect(run("head --he").events).toEqual([notice("head", "--help")]);
  });

  test("are found after simulated options and operands", () => {
    expect(run("head -n 1 a.txt -c 5").events).toEqual([notice("head", "-c")]);
  });

  test("give a notice for the first one only", () => {
    expect(run("head -z --version -v").events).toEqual([notice("head", "-z")]);
  });

  test("inside a cluster stop the input", () => {
    expect(run("ls -aZ").events).toEqual([notice("ls", "-Z")]);
  });

  test("before an invalid option win, because the real command may act on them first", () => {
    expect(run("head --help --nope").events).toEqual([notice("head", "--help")]);
    expect(run("ls -Zx").events).toEqual([notice("ls", "-Z")]);
  });

  test("after an invalid option are never reached", () => {
    expect(run("head --nope --help").events).toEqual([
      stderr("head: unrecognized option '--nope'\nTry 'head --help' for more information.\n"),
    ]);
  });

  test("after -- are operands", () => {
    expect(run("head -- -v").events).toEqual([stdout("operand -v\n")]);
  });
});

describe("defineCommand: usage errors", () => {
  test.each([
    ["head -x", "head: invalid option -- 'x'\n"],
    ["head --nope=1", "head: unrecognized option '--nope=1'\n"],
    ["head -n", "head: option requires an argument -- 'n'\n"],
    ["head --lines", "head: option '--lines' requires an argument\n"],
    ["head --quiet=yes", "head: option '--quiet' doesn't allow an argument\n"],
  ])("%s writes glibc's message and the Try line with exit status 1", (input, message) => {
    const result = run(input);
    expect(result.events).toEqual([stderr(`${message}Try 'head --help' for more information.\n`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("an ambiguous abbreviation lists the possibilities", () => {
    const result = run("ls --al");
    expect(result.events).toEqual([
      stderr(
        "ls: option '--al' is ambiguous; possibilities: '--all' '--almost-all'\n" +
          "Try 'ls --help' for more information.\n",
      ),
    ]);
  });

  test("the exit status is the command's own", () => {
    expect(run("ls -x").session.exitStatus).toBe(2);
    expect(run("nice -x").session.exitStatus).toBe(125);
  });

  test("simulated options before the error do not matter", () => {
    expect(run("head -q -x").events).toEqual([
      stderr("head: invalid option -- 'x'\nTry 'head --help' for more information.\n"),
    ]);
  });

  test("the input goes on after a usage error", () => {
    expect(run("head -x; plain yes").events.at(-1)).toEqual(stdout("yes\n"));
  });
});

/** A command with an obsolete form `-N` and a check of `-n`, like the real `head`. */
const counted = defineCommand<"lines" | "quiet" | "follow">({
  name: "counted",
  options: [
    { id: "lines", short: "n", argument: "required" },
    { id: "quiet", short: "q", argument: "none" },
    { id: "follow", short: "f", argument: "none" },
  ],
  simulated: ["lines", "quiet"],
  usageErrorStatus: 4,
  obsoleteSyntax: (args) => {
    const [first, ...rest] = args;
    if (first === undefined || !/^-\d/u.test(first)) {
      return undefined;
    }
    if (first.endsWith("x")) {
      return { ok: false, failure: { message: "bad obsolete option", tryHelp: true } };
    }
    if (first.endsWith("f")) {
      return { ok: true, options: [{ id: "follow", name: "-f", argument: undefined }], args: rest };
    }
    return {
      ok: true,
      options: [{ id: "lines", name: "-n", argument: first.slice(1) }],
      args: rest,
    };
  },
  checkOption: (option) =>
    option.id === "lines" && !/^\d+$/u.test(option.argument ?? "")
      ? { message: `bad count ${option.argument ?? ""}`, tryHelp: false }
      : undefined,
  run: report,
});

function runCounted(input: string): ScriptResult {
  return run(input, createCommandLookup([counted]));
}

describe("defineCommand: obsolete syntax", () => {
  test("its options come before the other options", () => {
    expect(runCounted("counted -5 -q a -n 2").events).toEqual([
      stdout("option lines -n 5\noption quiet -q -\noption lines -n 2\noperand a\n"),
    ]);
  });

  test("arguments of another form go to the option parser", () => {
    expect(runCounted("counted -q -5").events).toEqual([
      stderr("counted: invalid option -- '5'\nTry 'counted --help' for more information.\n"),
    ]);
  });

  test("an error writes its message and maybe the Try line, with the usage error status", () => {
    const result = runCounted("counted -5x -n");
    expect(result.events).toEqual([
      stderr("counted: bad obsolete option\nTry 'counted --help' for more information.\n"),
    ]);
    expect(result.session.exitStatus).toBe(4);
  });

  test("an option it stands for that the game does not simulate stops the input", () => {
    expect(runCounted("counted -5f").events).toEqual([notice("counted", "-f")]);
  });
});

describe("defineCommand: option checks", () => {
  test("a rejected option writes its message with the usage error status", () => {
    const result = runCounted("counted -n abc");
    expect(result.events).toEqual([stderr("counted: bad count abc\n")]);
    expect(result.session.exitStatus).toBe(4);
  });

  test("a rejected option comes before a later invalid option", () => {
    expect(runCounted("counted -n abc -x").events).toEqual([stderr("counted: bad count abc\n")]);
  });

  test("an invalid option before it is reported instead", () => {
    expect(runCounted("counted -x -n abc").events).toEqual([
      stderr("counted: invalid option -- 'x'\nTry 'counted --help' for more information.\n"),
    ]);
  });

  test("an option the game does not simulate before it stops the input", () => {
    expect(runCounted("counted -f -n abc").events).toEqual([notice("counted", "-f")]);
  });

  test("a rejected option before an unsimulated one wins, as the real command exits first", () => {
    expect(runCounted("counted -n abc -f").events).toEqual([stderr("counted: bad count abc\n")]);
  });

  test("an obsolete option is checked too", () => {
    expect(runCounted("counted -5a").events).toEqual([stderr("counted: bad count 5a\n")]);
  });
});

describe("defineCommand: usage error notes", () => {
  const noted = defineCommand({
    name: "noted",
    options: [{ id: "all", short: "a", argument: "none" }],
    simulated: ["all"],
    usageErrorStatus: 1,
    usageErrorNote: ({ args }) => `note for ${args.join(" ")}\n`,
    run: report,
  });
  const lookupNoted = createCommandLookup([noted]);

  test("come between glibc's message and the Try line", () => {
    expect(run("noted -x b", lookupNoted).events).toEqual([
      stderr(
        "noted: invalid option -- 'x'\nnote for -x b\nTry 'noted --help' for more information.\n",
      ),
    ]);
  });

  test("are not written without an error", () => {
    expect(run("noted -a", lookupNoted).events).toEqual([stdout("option all -a -\n")]);
  });
});

describe("defineCommand: invalid definitions", () => {
  const valid: CommandDefinition = {
    name: "head",
    options: [{ id: "lines", short: "n", argument: "required" }],
    simulated: ["lines"],
    usageErrorStatus: 1,
    run: () => ({ exitStatus: 0 }),
  };

  test("a valid definition is accepted", () => {
    expect(defineCommand(valid).name).toBe("head");
  });

  test.each<[string, Partial<CommandDefinition>]>([
    ["an empty name", { name: "" }],
    ["a name with a slash", { name: "bin/head" }],
    ["an invalid option table", { options: [{ id: "lines", argument: "required" }] }],
    ["a simulated option that is not in the table", { simulated: ["lines", "bytes"] }],
    ["usage error status 0", { usageErrorStatus: 0 }],
    ["usage error status 256", { usageErrorStatus: 256 }],
    ["a fractional usage error status", { usageErrorStatus: 1.5 }],
  ])("throws for %s", (_, change) => {
    expect(() => defineCommand({ ...valid, ...change })).toThrow(Error);
  });
});

describe("createCommandLookup", () => {
  test("finds commands by their exact name", () => {
    expect(commands("head")).toBe(head.run);
    expect(commands("plain")).toBe(plain.run);
    expect(commands("Head")).toBeUndefined();
    expect(commands("he")).toBeUndefined();
    expect(commands("constructor")).toBeUndefined();
  });

  test("unknown commands are not found by the shell", () => {
    expect(run("tail").events).toEqual([stderr("bash: tail: command not found\n")]);
  });

  test("throws for a name used twice", () => {
    expect(() => createCommandLookup([plain, plain])).toThrow(Error);
  });

  test.each(["", "bin/plain"])("throws for the invalid name %j", (name) => {
    expect(() => createCommandLookup([{ ...plain, name }])).toThrow(Error);
  });
});
