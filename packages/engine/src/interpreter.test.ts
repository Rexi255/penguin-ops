import { describe, expect, test } from "vitest";

import { createGameClock, type GameClock } from "./clock";
import {
  type CommandLookup,
  type ScriptResult,
  type ShellCommand,
  type ShellEvent,
  runScript,
  TIME_PER_INPUT,
} from "./interpreter";
import { parse } from "./parser";
import { createSession, type Session } from "./session";
import type { World } from "./world";
import { buildWorld } from "./world-builder";

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

/** Returns a world whose root directory has the mtime `mtime`, to see world changes. */
function withRootMtime(current: World, mtime: number): World {
  return { hosts: current.hosts.map((host) => ({ ...host, root: { ...host.root, mtime } })) };
}

function rootMtime(current: World): number | undefined {
  return current.hosts[0]?.root.mtime;
}

/** Simple test commands; the real commands follow with ROADMAP M1.8 to M1.10. */
const testCommands: Record<string, ShellCommand> = {
  true: () => ({ exitStatus: 0 }),
  false: () => ({ exitStatus: 1 }),
  /** Writes its arguments separated by spaces and a line break. */
  say: ({ args, stdout }) => {
    stdout(`${args.join(" ")}\n`);
    return { exitStatus: 0 };
  },
  /** Returns the exit status given as its argument. */
  exit: ({ args }) => ({ exitStatus: Number(args[0]) }),
  /** Writes its standard input in upper case, or `<terminal>` if it has none. */
  upper: ({ stdin, stdout }) => {
    stdout(stdin === undefined ? "<terminal>\n" : stdin.toUpperCase());
    return { exitStatus: 0 };
  },
  /** Writes the value of the variable named by its argument, or `<unset>`. */
  show: ({ args, session, stdout }) => {
    stdout(`${session.variables.get(args[0] ?? "") ?? "<unset>"}\n`);
    return { exitStatus: 0 };
  },
  /** Sets the variable named by its first argument to its second argument. */
  set: ({ args, session }) => {
    const variables = new Map(session.variables);
    variables.set(args[0] ?? "", args[1] ?? "");
    return { exitStatus: 0, session: { ...session, variables } };
  },
  /** Sets the root directory's mtime to the game time. */
  stamp: ({ world: current, clock }) => ({
    exitStatus: 0,
    world: withRootMtime(current, clock.now()),
  }),
  /** Writes to standard error, then to standard output, then to standard error again. */
  mixed: ({ stdout, stderr }) => {
    stderr("e1\n");
    stdout("o1\n");
    stderr("e2\n");
    return { exitStatus: 2 };
  },
  /** Writes `a`, nothing and `b` to standard output in three steps. */
  pieces: ({ stdout }) => {
    stdout("a");
    stdout("");
    stdout("b\n");
    return { exitStatus: 0 };
  },
  /** Writes its name and arguments, one per line, and sets exit status 0. */
  args: ({ name, args, stdout }) => {
    stdout([name, ...args].map((field) => `[${field}]\n`).join(""));
    return { exitStatus: 0 };
  },
};

const lookup: CommandLookup = (name) => testCommands[name];

interface RunOptions {
  readonly session?: Session;
  readonly world?: World;
  readonly clock?: GameClock;
  readonly commands?: CommandLookup;
}

function run(input: string, options: RunOptions = {}): ScriptResult {
  const parsed = parse(input);
  if (!parsed.ok) {
    throw new Error(`test input does not parse: ${input}`);
  }
  return runScript({
    world: options.world ?? world,
    session: options.session ?? alice,
    script: parsed.script,
    commands: options.commands ?? lookup,
    clock: options.clock ?? createGameClock(START),
  });
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

/** Runs the inputs one after the other in the same session, like a player at the prompt. */
function runAll(...inputs: string[]): ScriptResult {
  let session = alice;
  let current = world;
  let result: ScriptResult | undefined;
  for (const input of inputs) {
    result = run(input, { session, world: current });
    session = result.session;
    current = result.world;
  }
  if (result === undefined) {
    throw new Error("runAll needs at least one input");
  }
  return result;
}

describe("runScript: the game clock", () => {
  test("advances the clock by one second per input before the commands run", () => {
    const clock = createGameClock(START);
    const first = run("stamp", { clock });
    expect(TIME_PER_INPUT).toBe(1000);
    expect(clock.now()).toBe(START + 1000);
    expect(rootMtime(first.world)).toBe(START + 1000);
    const second = run("stamp; stamp", { clock, world: first.world });
    expect(clock.now()).toBe(START + 2000);
    expect(rootMtime(second.world)).toBe(START + 2000);
  });

  test("advances the clock for an empty input too", () => {
    const clock = createGameClock(START);
    run("", { clock });
    expect(clock.now()).toBe(START + TIME_PER_INPUT);
  });
});

describe("runScript: lists", () => {
  test("an empty input changes nothing and keeps the exit status", () => {
    const session = { ...alice, exitStatus: 3 };
    const result = run("", { session });
    expect(result.events).toEqual([]);
    expect(result.session).toEqual(session);
    expect(result.world).toBe(world);
  });

  test("; and line breaks run every list in order", () => {
    const result = run("say a; false\nsay b");
    expect(result.events).toEqual([stdout("a\nb\n")]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("the exit status is that of the last list", () => {
    expect(run("true; false").session.exitStatus).toBe(1);
    expect(run("false; exit 7").session.exitStatus).toBe(7);
  });

  test("&& runs the next pipeline only after exit status 0", () => {
    expect(run("true && say yes").events).toEqual([stdout("yes\n")]);
    const failed = run("exit 4 && say yes");
    expect(failed.events).toEqual([]);
    expect(failed.session.exitStatus).toBe(4);
  });

  test("|| runs the next pipeline only after a non-zero exit status", () => {
    expect(run("false || say no").events).toEqual([stdout("no\n")]);
    const succeeded = run("true || say no");
    expect(succeeded.events).toEqual([]);
    expect(succeeded.session.exitStatus).toBe(0);
  });

  test("&& and || go from left to right and a skipped pipeline keeps the status", () => {
    expect(run("false && say a || say b").events).toEqual([stdout("b\n")]);
    expect(run("true || say a && say b").events).toEqual([stdout("b\n")]);
    expect(run("false || false || say c").events).toEqual([stdout("c\n")]);
    expect(run("true && false && say d").session.exitStatus).toBe(1);
  });

  test("$? expands to the exit status of the previous pipeline", () => {
    expect(run("exit 3; say $?; say $?").events).toEqual([stdout("3\n0\n")]);
    expect(run("false || say $?").events).toEqual([stdout("1\n")]);
    expect(runAll("exit 42", "say $?").events).toEqual([stdout("42\n")]);
  });

  test("exit status 0 to 255 is accepted, anything else is a bug in the command", () => {
    expect(run("exit 255").session.exitStatus).toBe(255);
    expect(() => run("exit 256")).toThrow(RangeError);
    expect(() => run("exit -1")).toThrow(RangeError);
    expect(() => run("exit 1.5")).toThrow(RangeError);
  });

  test("throws if the session's host is not part of the world", () => {
    expect(() => run("say a", { session: { ...alice, host: "ws99" } })).toThrow(/ws99/);
  });
});

describe("runScript: simple commands", () => {
  test("passes the expanded name and arguments to the command", () => {
    expect(run("args 'a b' ~ $HOME/x").events).toEqual([
      stdout("[args]\n[a b]\n[/home/alice]\n[/home/alice/x]\n"),
    ]);
  });

  test("a command name from an expansion is looked up after expansion", () => {
    const session = { ...alice, variables: new Map([...alice.variables, ["CMD", "say hi"]]) };
    expect(run("$CMD there", { session }).events).toEqual([stdout("hi there\n")]);
  });

  test("standard input is the terminal outside of a pipeline", () => {
    expect(run("upper").events).toEqual([stdout("<terminal>\n")]);
  });

  test("keeps the order of standard output and standard error and merges neighbours", () => {
    const result = run("mixed; say a; say b");
    expect(result.events).toEqual([
      stderr("e1\n"),
      stdout("o1\n"),
      stderr("e2\n"),
      stdout("a\nb\n"),
    ]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("keeps the session and world changes of a command", () => {
    const result = run("set X 1; stamp; show X");
    expect(result.events).toEqual([stdout("1\n")]);
    expect(result.session.variables.get("X")).toBe("1");
    expect(rootMtime(result.world)).toBe(START + TIME_PER_INPUT);
  });

  test("a command that changes nothing keeps the same world object", () => {
    expect(run("say a").world).toBe(world);
  });
});

describe("runScript: command not found", () => {
  test("writes bash's message and sets exit status 127", () => {
    const result = run("nosuch -l; say $?");
    expect(result.events).toEqual([stderr("bash: nosuch: command not found\n"), stdout("127\n")]);
  });

  test("an empty command name is not found either", () => {
    const result = run("''");
    expect(result.events).toEqual([stderr("bash: : command not found\n")]);
    expect(result.session.exitStatus).toBe(127);
  });

  test("assignments before an unknown command are not kept", () => {
    const result = run("X=1 nosuch");
    expect(result.session.variables.has("X")).toBe(false);
    expect(result.session.exitStatus).toBe(127);
  });

  test("the message of a command inside a pipeline goes to the terminal", () => {
    const result = run("nosuch | upper");
    expect(result.events).toEqual([stderr("bash: nosuch: command not found\n")]);
    expect(result.session.exitStatus).toBe(0);
    expect(run("say a | nosuch").session.exitStatus).toBe(127);
  });
});

describe("runScript: pipelines", () => {
  test("the standard output of a command is the standard input of the next", () => {
    expect(run("say hello | upper").events).toEqual([stdout("HELLO\n")]);
    expect(run("say a b | upper | upper").events).toEqual([stdout("A B\n")]);
  });

  test("the first command reads from the terminal", () => {
    expect(run("upper | upper").events).toEqual([stdout("<TERMINAL>\n")]);
  });

  test("output written in several steps reaches the next command as one text", () => {
    expect(run("pieces | upper").events).toEqual([stdout("AB\n")]);
    expect(run("pieces").events).toEqual([stdout("ab\n")]);
  });

  test("a command without output gives the next command empty input", () => {
    expect(run("true | upper; say end").events).toEqual([stdout("end\n")]);
  });

  test("the exit status is that of the last command", () => {
    expect(run("false | true").session.exitStatus).toBe(0);
    expect(run("true | false").session.exitStatus).toBe(1);
    expect(run("exit 5 | exit 6; say $?").events).toEqual([stdout("6\n")]);
  });

  test("standard error goes to the terminal in the order the commands ran", () => {
    const result = run("mixed | upper");
    expect(result.events).toEqual([stderr("e1\ne2\n"), stdout("O1\n")]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("changes to the session inside a pipeline are lost, like in a subshell", () => {
    const result = run("set X 1 | true; show X");
    expect(result.events).toEqual([stdout("<unset>\n")]);
    expect(run("true | set X 1").session.variables.has("X")).toBe(false);
  });

  test("changes to the world inside a pipeline stay", () => {
    expect(rootMtime(run("stamp | true").world)).toBe(START + TIME_PER_INPUT);
    expect(rootMtime(run("true | stamp").world)).toBe(START + TIME_PER_INPUT);
  });

  test("&& and || look at the exit status of the whole pipeline", () => {
    expect(run("false | true && say ok").events).toEqual([stdout("ok\n")]);
    expect(run("true | false || say failed").events).toEqual([stdout("failed\n")]);
  });
});

describe("runScript: assignments", () => {
  test("an assignment without a command name sets a shell variable with exit status 0", () => {
    const result = run("false; X=hello");
    expect(result.session.variables.get("X")).toBe("hello");
    expect(result.session.exitStatus).toBe(0);
    expect(result.events).toEqual([]);
  });

  test("assignments run from left to right and see the earlier ones", () => {
    const result = run("A=1 B=$A$A");
    expect(result.session.variables.get("B")).toBe("11");
  });

  test("+= appends to the value, or to the empty string if unset", () => {
    expect(run("X=ab; X+=cd; show X").events).toEqual([stdout("abcd\n")]);
    expect(run("Y+=new; show Y").events).toEqual([stdout("new\n")]);
  });

  test("an assignment value is neither split nor globbed, but tildes expand", () => {
    const result = run("A='x y' B=* C=~/bin");
    expect(result.session.variables.get("A")).toBe("x y");
    expect(result.session.variables.get("B")).toBe("*");
    expect(result.session.variables.get("C")).toBe("/home/alice/bin");
  });

  test("$? in an assignment is the status before it", () => {
    expect(run("exit 9; X=$?; show X; say $?").events).toEqual([stdout("9\n0\n")]);
  });

  test("assigned variables are seen by later lists and later inputs", () => {
    expect(run("X=1; show X").events).toEqual([stdout("1\n")]);
    expect(runAll("X=2", "show X").events).toEqual([stdout("2\n")]);
  });

  test("an assignment to IFS changes later field splitting", () => {
    expect(run("V=a:b; IFS=:; args $V").events).toEqual([stdout("[args]\n[a]\n[b]\n")]);
  });

  test("assignments before a command name are set only for that command", () => {
    const result = run("X=temp show X; show X");
    expect(result.events).toEqual([stdout("temp\n<unset>\n")]);
  });

  test("assignments before a command name give an existing variable its value back", () => {
    const result = run("X=old; X=new show X; X+=er show X; show X");
    expect(result.events).toEqual([stdout("new\nolder\nold\n")]);
  });

  test("a command's own change to an assigned variable is undone as well", () => {
    expect(run("X=1 set X 2; show X").events).toEqual([stdout("<unset>\n")]);
  });

  test("a command's change to other variables stays", () => {
    expect(run("X=1 set Y 2; show Y; show X").events).toEqual([stdout("2\n<unset>\n")]);
  });

  test("the words are expanded before the assignments", () => {
    expect(run("X=1 say $X.").events).toEqual([stdout(".\n")]);
  });

  test("@differential an assignment before a command name sees the ones before it", () => {
    expect(run("A=1 B=$A show B").events).toEqual([stdout("1\n")]);
  });

  test("if the words expand to nothing, the assignments set shell variables", () => {
    const result = run("false; X=1 $EMPTY");
    expect(result.session.variables.get("X")).toBe("1");
    expect(result.session.exitStatus).toBe(0);
  });

  test("assignments in a pipeline are lost after the pipeline", () => {
    expect(run("X=1 | true; show X").events).toEqual([stdout("<unset>\n")]);
  });
});

describe("runScript: unsupported features", () => {
  test("an expansion error stops the rest of the input with exit status 1", () => {
    const result = run("say a; say $$; say b");
    expect(result.events).toEqual([
      stdout("a\n"),
      { kind: "unsupported", feature: "process-id", start: 11 },
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("an expansion error in an assignment stops the input", () => {
    const result = run("X=$- && say no");
    expect(result.events).toEqual([{ kind: "unsupported", feature: "shell-options", start: 0 }]);
    expect(result.session.exitStatus).toBe(1);
    expect(result.session.variables.has("X")).toBe(false);
  });

  test("an expansion error in a prefix assignment stops the input before the command", () => {
    const result = run("X=$$ say no");
    expect(result.events).toEqual([{ kind: "unsupported", feature: "process-id", start: 0 }]);
  });

  test("redirections are not simulated yet", () => {
    const result = run("say a; say b > out.txt; say c");
    expect(result.events).toEqual([
      stdout("a\n"),
      { kind: "unsupported", feature: "redirection", start: 13 },
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("command names with a slash are not simulated yet", () => {
    const result = run("X=1 ./run.sh; say no");
    expect(result.events).toEqual([{ kind: "unsupported", feature: "command-path", start: 4 }]);
    expect(result.session.exitStatus).toBe(1);
    expect(run("/bin/ls").events).toEqual([
      { kind: "unsupported", feature: "command-path", start: 0 },
    ]);
  });

  test("a stop keeps the changes made before it", () => {
    const result = run("X=1; stamp; say $$");
    expect(result.session.variables.get("X")).toBe("1");
    expect(rootMtime(result.world)).toBe(START + TIME_PER_INPUT);
  });

  test("a stop inside a pipeline keeps the world changes and the error output before it", () => {
    const result = run("mixed | stamp | say $$");
    expect(result.events).toEqual([
      stderr("e1\ne2\n"),
      { kind: "unsupported", feature: "process-id", start: 20 },
    ]);
    expect(rootMtime(result.world)).toBe(START + TIME_PER_INPUT);
    expect(result.session.exitStatus).toBe(1);
  });
});
