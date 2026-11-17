import { describe, expect, test } from "vitest";

import { createGameClock, type GameClock } from "./clock";
import type { FsNode } from "./fs-node";
import {
  type CommandLookup,
  type ScriptResult,
  type ShellCommand,
  type ShellEvent,
  runScript,
  type Terminal,
  TIME_PER_INPUT,
} from "./interpreter";
import { lookup as lookupPath } from "./lookup";
import { parse } from "./parser";
import { createSession, type Session } from "./session";
import { findHost, type World } from "./world";
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
  /** Writes its standard input in upper case, or `<terminal>` or `<directory>` if it has none. */
  upper: ({ stdin, stdout }) => {
    switch (stdin.kind) {
      case "terminal":
        stdout("<terminal>\n");
        break;
      case "directory":
        stdout("<directory>\n");
        break;
      case "text":
        stdout(stdin.text.toUpperCase());
        break;
    }
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
  /** Writes the terminal's width to standard error, or `<no terminal>` if stdout goes elsewhere. */
  tty: ({ terminal, stderr }) => {
    stderr(terminal === undefined ? "<no terminal>\n" : `${String(terminal.columns)}\n`);
    return { exitStatus: 0 };
  },
  /**
   * Writes `before`, clears the screen (with the scrollback unless its argument is `keep`) and
   * writes `after`; without a terminal it writes `<no terminal>` instead of clearing.
   */
  wipe: ({ args, terminal, stdout }) => {
    stdout("before\n");
    if (terminal === undefined) {
      stdout("<no terminal>\n");
    } else {
      terminal.clearScreen(args[0] !== "keep");
    }
    stdout("after\n");
    return { exitStatus: 0 };
  },
  /** Changes the working directory to its argument without any checks, and says so. */
  go: ({ args, session, stdout }) => {
    stdout("moved\n");
    return { exitStatus: 0, session: { ...session, cwd: args[0] ?? "/" } };
  },
  /** Writes to both streams, then stops with a notice. */
  halt: ({ stdout: out, stderr: err }) => {
    out("partial\n");
    err("warning\n");
    return { stop: { key: "option-not-simulated", option: "-Z" } };
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
  readonly terminal?: Terminal;
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
    terminal: options.terminal ?? { columns: 80 },
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

describe("runScript: the terminal", () => {
  test("a command whose output goes to the terminal learns its width", () => {
    expect(run("tty").events).toEqual([stderr("80\n")]);
    expect(run("tty", { terminal: { columns: 132 } }).events).toEqual([stderr("132\n")]);
  });

  test("only the last command of a pipeline writes to the terminal", () => {
    expect(run("tty | upper").events).toEqual([stderr("<no terminal>\n")]);
    expect(run("say | tty").events).toEqual([stderr("80\n")]);
  });

  test("redirecting standard output to a file takes the terminal away", () => {
    expect(run("tty > /home/alice/out.txt").events).toEqual([stderr("<no terminal>\n")]);
    expect(run("tty 1>> /home/alice/out.txt").events).toEqual([stderr("<no terminal>\n")]);
  });

  test("redirecting standard input or standard error keeps the terminal", () => {
    expect(run("tty < /home/alice/notes.txt").events).toEqual([stderr("80\n")]);
    const result = run("tty 2> /home/alice/err.txt");
    expect(result.events).toEqual([]);
    const host = findHost(result.world, "ws01");
    const written = host && lookupPath(host.root, alice.credentials, "/", "/home/alice/err.txt");
    expect(written).toMatchObject({ ok: true, node: { content: "80\n" } });
  });

  test("a terminal narrower than one column or of a fractional width is an error", () => {
    expect(() => run("true", { terminal: { columns: 0 } })).toThrow(RangeError);
    expect(() => run("true", { terminal: { columns: 1.5 } })).toThrow(RangeError);
    expect(() => run("true", { terminal: { columns: Number.NaN } })).toThrow(RangeError);
    expect(run("tty", { terminal: { columns: 1 } }).events).toEqual([stderr("1\n")]);
  });

  test("a command on the terminal clears the screen at its place in the output", () => {
    expect(run("say hi; wipe; say ho").events).toEqual([
      stdout("hi\nbefore\n"),
      { kind: "clear-screen", clearsScrollback: true },
      stdout("after\nho\n"),
    ]);
    expect(run("wipe keep").events).toEqual([
      stdout("before\n"),
      { kind: "clear-screen", clearsScrollback: false },
      stdout("after\n"),
    ]);
  });

  test("a command clears the screen as the last command of a pipeline only", () => {
    expect(run("mixed | wipe").events).toEqual([
      stderr("e1\ne2\n"),
      stdout("before\n"),
      { kind: "clear-screen", clearsScrollback: true },
      stdout("after\n"),
    ]);
    expect(run("wipe | upper").events).toEqual([stdout("BEFORE\n<NO TERMINAL>\nAFTER\n")]);
  });

  test("a command whose output goes to a file cannot clear the screen", () => {
    const result = run("wipe > /home/alice/out.txt");
    expect(result.events).toEqual([]);
    const host = findHost(result.world, "ws01");
    const written = host && lookupPath(host.root, alice.credentials, "/", "/home/alice/out.txt");
    expect(written).toMatchObject({
      ok: true,
      node: { content: "before\n<no terminal>\nafter\n" },
    });
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

/** A world with files for the redirection tests; alice's working directory is her home. */
const filesWorld = buildWorld(
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
        files: {
          "/home/alice/notes.txt": "hello\n",
          "/home/alice/locked.txt": { content: "locked\n", mode: 0o444 },
          "/home/alice/drop.txt": { content: "secret\n", mode: 0o200 },
          "/home/alice/docs/a.txt": "a\n",
          "/home/alice/docs/b.txt": "b\n",
          "/tmp/": { mode: 0o1777 },
        },
      },
    ],
  },
  createGameClock(START),
);

const filesAlice = createSession(filesWorld, "ws01", "alice");

/** The game time of the first input. */
const NOW = START + TIME_PER_INPUT;

/** Runs `input` as alice in `filesWorld`, or in `current`. */
function runFiles(input: string, current: World = filesWorld): ScriptResult {
  return run(input, { world: current, session: filesAlice });
}

/** Returns the node at the absolute `path` of ws01, looked up as root. */
function nodeAt(current: World, path: string): FsNode | undefined {
  const root = findHost(current, "ws01")?.root;
  if (root === undefined) {
    throw new Error("no host ws01");
  }
  const result = lookupPath(root, createSession(filesWorld, "ws01", "root").credentials, "/", path);
  return result.ok ? result.node : undefined;
}

/** Returns the content of the file at the absolute `path`, or `undefined` if there is none. */
function contentOf(current: World, path: string): string | undefined {
  const node = nodeAt(current, path);
  return node?.kind === "file" ? node.content : undefined;
}

describe("runScript: output redirections", () => {
  test("> creates a file with the output, like bash with the umask", () => {
    const result = runFiles("say hi > out.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/out.txt")).toEqual({
      kind: "file",
      owner: 1000,
      group: 1000,
      mode: 0o664,
      mtime: NOW,
      content: "hi\n",
    });
  });

  test("> replaces the content of an existing file", () => {
    const result = runFiles("say new > notes.txt");
    expect(contentOf(result.world, "/home/alice/notes.txt")).toBe("new\n");
  });

  test(">> adds the output to the end of an existing file and creates a missing one", () => {
    const result = runFiles("say more >> notes.txt; say first >> new.txt");
    expect(contentOf(result.world, "/home/alice/notes.txt")).toBe("hello\nmore\n");
    expect(contentOf(result.world, "/home/alice/new.txt")).toBe("first\n");
  });

  test("> without a command name creates an empty file or empties one", () => {
    const result = runFiles("> empty.txt; > notes.txt; >> docs/a.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(contentOf(result.world, "/home/alice/empty.txt")).toBe("");
    expect(contentOf(result.world, "/home/alice/notes.txt")).toBe("");
    expect(contentOf(result.world, "/home/alice/docs/a.txt")).toBe("a\n");
  });

  test("the redirection may stand before, between or after the words", () => {
    const result = runFiles("> a.txt say x; say > b.txt y; say z > c.txt");
    expect(contentOf(result.world, "/home/alice/a.txt")).toBe("x\n");
    expect(contentOf(result.world, "/home/alice/b.txt")).toBe("y\n");
    expect(contentOf(result.world, "/home/alice/c.txt")).toBe("z\n");
  });

  test("2> sends standard error to a file and keeps standard output on the terminal", () => {
    const result = runFiles("mixed 2> err.txt");
    expect(result.events).toEqual([stdout("o1\n")]);
    expect(result.session.exitStatus).toBe(2);
    expect(contentOf(result.world, "/home/alice/err.txt")).toBe("e1\ne2\n");
  });

  test("> and 2>> send both streams to their own files", () => {
    const result = runFiles("mixed > out.txt 2>> notes.txt");
    expect(result.events).toEqual([]);
    expect(contentOf(result.world, "/home/alice/out.txt")).toBe("o1\n");
    expect(contentOf(result.world, "/home/alice/notes.txt")).toBe("hello\ne1\ne2\n");
  });

  test("two redirections to the same file get the output in write order", () => {
    const result = runFiles("mixed > out.txt 2>> out.txt; pieces >> out.txt");
    expect(result.events).toEqual([]);
    expect(contentOf(result.world, "/home/alice/out.txt")).toBe("e1\no1\ne2\nab\n");
  });

  test("1> and 1>> are the same as > and >>", () => {
    const result = runFiles("say a 1> one.txt; say b 1>> one.txt");
    expect(contentOf(result.world, "/home/alice/one.txt")).toBe("a\nb\n");
  });

  test("@differential leading zeros in the file descriptor are ignored", () => {
    const result = runFiles("say a 01> one.txt; mixed 002> two.txt");
    expect(contentOf(result.world, "/home/alice/one.txt")).toBe("a\n");
    expect(contentOf(result.world, "/home/alice/two.txt")).toBe("e1\ne2\n");
  });

  test("the last redirection of a stream wins, but every target is opened", () => {
    const result = runFiles("say hi > first.txt > second.txt");
    expect(contentOf(result.world, "/home/alice/first.txt")).toBe("");
    expect(contentOf(result.world, "/home/alice/second.txt")).toBe("hi\n");
  });

  test("the target is expanded: tilde, variables and a pattern with one match", () => {
    const result = runFiles('NAME=log.txt; say a > ~/$NAME; say b >> "$HOME/$NAME"; say c > d*/a*');
    expect(contentOf(result.world, "/home/alice/log.txt")).toBe("a\nb\n");
    expect(contentOf(result.world, "/home/alice/docs/a.txt")).toBe("c\n");
  });

  test("a quoted target with spaces is one file name", () => {
    const result = runFiles('X="my notes.txt"; say hi > "$X"');
    expect(contentOf(result.world, "/home/alice/my notes.txt")).toBe("hi\n");
  });

  test("the file is opened in the working directory before the command runs", () => {
    const result = runFiles("go /tmp > moved.txt");
    expect(result.session.cwd).toBe("/tmp");
    expect(contentOf(result.world, "/home/alice/moved.txt")).toBe("moved\n");
    expect(nodeAt(result.world, "/tmp/moved.txt")).toBeUndefined();
  });

  test("the command sees the opened file and its world changes stay", () => {
    const result = runFiles("stamp > out.txt");
    expect(rootMtime(result.world)).toBe(NOW);
    expect(contentOf(result.world, "/home/alice/out.txt")).toBe("");
  });

  test("a later input appends with its own time", () => {
    const first = runFiles("say a > log.txt");
    const clock = createGameClock(NOW);
    const second = run("say b >> log.txt", { world: first.world, session: filesAlice, clock });
    expect(nodeAt(second.world, "/home/alice/log.txt")).toMatchObject({
      content: "a\nb\n",
      mtime: NOW + TIME_PER_INPUT,
    });
  });

  test("the output of a command that is not found goes to the redirected standard error", () => {
    const result = runFiles("nosuch > out.txt 2> err.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(127);
    expect(contentOf(result.world, "/home/alice/out.txt")).toBe("");
    expect(contentOf(result.world, "/home/alice/err.txt")).toBe(
      "bash: nosuch: command not found\n",
    );
  });

  test("@differential prefix assignments are seen by the target and then restored", () => {
    const result = runFiles("F=b.txt say hi > $F; show F");
    expect(contentOf(result.world, "/home/alice/b.txt")).toBe("hi\n");
    expect(result.events).toEqual([stdout("<unset>\n")]);
  });

  test("@differential assignments without a command name are made before the redirection", () => {
    const result = runFiles("F=c.txt > $F; show F");
    expect(nodeAt(result.world, "/home/alice/c.txt")).toBeDefined();
    expect(result.events).toEqual([stdout("c.txt\n")]);
  });
});

describe("runScript: input redirections", () => {
  test("< gives the content of a file as standard input", () => {
    const result = runFiles("upper < notes.txt; < docs/a.txt upper");
    expect(result.events).toEqual([stdout("HELLO\nA\n")]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("0< is the same as <", () => {
    expect(runFiles("upper 0< notes.txt").events).toEqual([stdout("HELLO\n")]);
  });

  test("< opens a directory, which the command cannot read", () => {
    expect(runFiles("upper < docs").events).toEqual([stdout("<directory>\n")]);
  });

  test("< without a command name only checks that the file can be opened", () => {
    expect(runFiles("< notes.txt").session.exitStatus).toBe(0);
    expect(runFiles("< missing.txt").session.exitStatus).toBe(1);
  });

  test("> empties the file before the command reads it, in either order (< f > f)", () => {
    for (const input of ["upper < notes.txt > notes.txt", "upper > notes.txt < notes.txt"]) {
      const result = runFiles(input);
      expect(contentOf(result.world, "/home/alice/notes.txt")).toBe("");
    }
  });

  test(">> keeps the content that < reads from the same file", () => {
    const result = runFiles("upper < notes.txt >> notes.txt");
    expect(contentOf(result.world, "/home/alice/notes.txt")).toBe("hello\nHELLO\n");
  });

  test("a later < wins over an earlier one", () => {
    expect(runFiles("upper < docs < notes.txt").events).toEqual([stdout("HELLO\n")]);
  });
});

describe("runScript: redirections in pipelines", () => {
  test("> wins over the pipe: the next command reads nothing", () => {
    const result = runFiles("say hi > out.txt | upper");
    expect(result.events).toEqual([]);
    expect(contentOf(result.world, "/home/alice/out.txt")).toBe("hi\n");
  });

  test("< wins over the pipe", () => {
    expect(runFiles("say hi | upper < notes.txt").events).toEqual([stdout("HELLO\n")]);
  });

  test("2> in the middle of a pipeline keeps standard error off the terminal", () => {
    const result = runFiles("mixed 2> err.txt | upper");
    expect(result.events).toEqual([stdout("O1\n")]);
    expect(contentOf(result.world, "/home/alice/err.txt")).toBe("e1\ne2\n");
  });

  test("the last command of a pipeline can write to a file", () => {
    const result = runFiles("say hi | upper > out.txt");
    expect(result.events).toEqual([]);
    expect(contentOf(result.world, "/home/alice/out.txt")).toBe("HI\n");
  });
});

describe("runScript: failed redirections", () => {
  test.each([
    ["say hi > missing/out.txt", "bash: missing/out.txt: No such file or directory\n"],
    ["say hi > notes.txt/out.txt", "bash: notes.txt/out.txt: Not a directory\n"],
    ["say hi > locked.txt", "bash: locked.txt: Permission denied\n"],
    ["say hi >> locked.txt", "bash: locked.txt: Permission denied\n"],
    ["say hi > docs", "bash: docs: Is a directory\n"],
    ["say hi 2> docs", "bash: docs: Is a directory\n"],
    ["upper < missing.txt", "bash: missing.txt: No such file or directory\n"],
    ["upper < notes.txt/x", "bash: notes.txt/x: Not a directory\n"],
    ["upper < drop.txt", "bash: drop.txt: Permission denied\n"],
    ['say hi > ""', "bash: : No such file or directory\n"],
  ])("%s writes bash's message, exit status 1, and the command does not run", (input, error) => {
    const result = runFiles(input);
    expect(result.events).toEqual([stderr(error)]);
    expect(result.session.exitStatus).toBe(1);
    expect(contentOf(result.world, "/home/alice/locked.txt")).toBe("locked\n");
  });

  test("the message shows the expanded path", () => {
    expect(runFiles("say hi > ~/missing/x").events).toEqual([
      stderr("bash: /home/alice/missing/x: No such file or directory\n"),
    ]);
  });

  test("the files opened before the failed redirection stay", () => {
    const result = runFiles("say hi > first.txt > missing/x");
    expect(contentOf(result.world, "/home/alice/first.txt")).toBe("");
  });

  test("@differential the message goes to standard error as redirected before it", () => {
    const result = runFiles("say hi 2> err.txt > missing/x");
    expect(result.events).toEqual([]);
    expect(contentOf(result.world, "/home/alice/err.txt")).toBe(
      "bash: missing/x: No such file or directory\n",
    );
  });

  test("the exit status 1 works with || and &&", () => {
    expect(runFiles("say a > missing/x || say failed; say b > missing/x && say no").events).toEqual(
      [
        stderr("bash: missing/x: No such file or directory\n"),
        stdout("failed\n"),
        stderr("bash: missing/x: No such file or directory\n"),
      ],
    );
  });

  test("a command that is not found is not looked up after a failed redirection", () => {
    const result = runFiles("nosuch > missing/x");
    expect(result.events).toEqual([stderr("bash: missing/x: No such file or directory\n")]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("assignments before a command name are lost", () => {
    const result = runFiles("X=1 say hi > missing/x; show X");
    expect(result.events.at(-1)).toEqual(stdout("<unset>\n"));
  });

  test("@differential assignments without a command name stay", () => {
    const result = runFiles("X=1 > missing/x");
    expect(result.session.variables.get("X")).toBe("1");
    expect(result.session.exitStatus).toBe(1);
  });

  test.each([
    ["say hi > $EMPTY", "bash: $EMPTY: ambiguous redirect\n"],
    ['X="a b"; say hi > $X', "bash: $X: ambiguous redirect\n"],
    ["say hi > docs/*.txt", "bash: docs/*.txt: ambiguous redirect\n"],
    ["upper < docs/*", "bash: docs/*: ambiguous redirect\n"],
  ])("%s is an ambiguous redirect with exit status 1", (input, error) => {
    const result = runFiles(input);
    expect(result.events).toEqual([stderr(error)]);
    expect(result.session.exitStatus).toBe(1);
    expect(contentOf(result.world, "/home/alice/docs/a.txt")).toBe("a\n");
  });
});

describe("runScript: unsupported redirections", () => {
  test.each([
    ["say a; say b 3> x.txt; say c", "file-descriptor", 13],
    ["say b 9< notes.txt", "file-descriptor", 6],
    ["say b 007> x.txt", "file-descriptor", 6],
    ["say b 0> x.txt", "reversed-redirection", 6],
    ["upper 1< notes.txt", "reversed-redirection", 6],
    ["upper 2< notes.txt", "reversed-redirection", 6],
    ["say b > $$", "process-id", 8],
  ] as const)("%s stops the input with the notice %s", (input, feature, start) => {
    const result = runFiles(input);
    expect(result.events.at(-1)).toEqual({ kind: "unsupported", feature, start });
    expect(result.events.filter((event) => event.kind === "output")).toEqual(
      input.startsWith("say a") ? [stdout("a\n")] : [],
    );
    expect(result.session.exitStatus).toBe(1);
    expect(nodeAt(result.world, "/home/alice/x.txt")).toBeUndefined();
  });

  test("a stop keeps the files opened before it", () => {
    const result = runFiles("say hi > first.txt 3> x.txt");
    expect(contentOf(result.world, "/home/alice/first.txt")).toBe("");
    expect(result.session.exitStatus).toBe(1);
  });

  test("a stop keeps assignments without a command name, which come before it", () => {
    const result = runFiles("X=1 > first.txt 3> x.txt");
    expect(result.session.variables.get("X")).toBe("1");
    expect(contentOf(result.world, "/home/alice/first.txt")).toBe("");
    expect(result.session.exitStatus).toBe(1);
  });

  test("a stop loses assignments before a command name", () => {
    const result = runFiles("X=1 say hi 3> x.txt");
    expect(result.session.variables.has("X")).toBe(false);
  });
});

describe("runScript: commands that stop", () => {
  const notice: ShellEvent = {
    kind: "notice",
    command: "halt",
    notice: { key: "option-not-simulated", option: "-Z" },
  };

  test("a stop keeps the output before it, ends with the notice and stops the input", () => {
    const result = run("say a; halt; say b");
    expect(result.events).toEqual([stdout("a\npartial\n"), stderr("warning\n"), notice]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a stop ends and-or lists like an unsupported feature", () => {
    expect(run("false || halt || say no").events.at(-1)).toEqual(notice);
    expect(run("halt && say no").events).not.toContainEqual(stdout("no\n"));
  });

  test("a stop keeps the changes before it and loses assignments before the command name", () => {
    const result = run("X=1; stamp; Y=2 halt");
    expect(result.session.variables.get("X")).toBe("1");
    expect(result.session.variables.has("Y")).toBe(false);
    expect(rootMtime(result.world)).toBe(START + TIME_PER_INPUT);
  });

  test("a stop keeps the files its redirections opened, with the output written to them", () => {
    const result = runFiles("halt > out.txt 2> err.txt; say no");
    expect(contentOf(result.world, "/home/alice/out.txt")).toBe("partial\n");
    expect(contentOf(result.world, "/home/alice/err.txt")).toBe("warning\n");
    expect(result.events).toEqual([notice]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a stop inside a pipeline shows its error output, then the notice", () => {
    const result = run("stamp | halt | upper");
    expect(result.events).toEqual([stderr("warning\n"), notice]);
    expect(rootMtime(result.world)).toBe(START + TIME_PER_INPUT);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a stop at the end of a pipeline shows its output", () => {
    const result = run("say a | halt");
    expect(result.events).toEqual([stdout("partial\n"), stderr("warning\n"), notice]);
  });
});
