import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createCommandLookup } from "../command-registry";
import type { FsNode } from "../fs-node";
import { runScript, type ScriptResult, type ShellEvent } from "../interpreter";
import { lookup } from "../lookup";
import { parse } from "../parser";
import { createSession, type Session } from "../session";
import { findHost, type World } from "../world";
import { buildWorld } from "../world-builder";
import { COMMANDS } from ".";
import { ancestorsOf } from "./mkdir";

const BUILT = 1_700_000_000_000;
/** The time of the input: the clock moves one second per input. */
const NOW = BUILT + 1000;

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
        files: {
          "/home/alice/notes.txt": "hello\n",
          "/home/alice/docs/": {},
          "/home/alice/locked/": { mode: 0o555 },
          "/home/alice/hidden/": { mode: 0o600 },
          "/srv/closed/": { mode: 0o700 },
        },
      },
    ],
  },
  createGameClock(BUILT),
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
    clock: createGameClock(BUILT),
    terminal: { columns: 80 },
  });
}

function stdout(text: string): ShellEvent {
  return { kind: "output", stream: "stdout", text };
}

function stderr(text: string): ShellEvent {
  return { kind: "output", stream: "stderr", text };
}

function nodeAt(current: World, path: string): FsNode | undefined {
  const root = findHost(current, "ws01")?.root;
  if (root === undefined) {
    throw new Error("no host ws01");
  }
  const found = lookup(root, createSession(world, "ws01", "root").credentials, "/", path);
  return found.ok ? found.node : undefined;
}

const TRY_HELP = "Try 'mkdir --help' for more information.\n";

describe("mkdir", () => {
  test("creates a directory with the mode 0777 & ~umask", () => {
    const result = run("mkdir projects");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/projects")).toMatchObject({
      kind: "directory",
      owner: 1000,
      group: 1000,
      mode: 0o775,
      mtime: NOW,
    });
  });

  test("creates several directories in order", () => {
    const result = run("mkdir a b a/c");
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/a/c")?.kind).toBe("directory");
    expect(nodeAt(result.world, "/home/alice/b")?.kind).toBe("directory");
  });

  test("accepts absolute paths and a trailing slash", () => {
    const result = run("mkdir /home/alice/docs/new/");
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/docs/new")?.kind).toBe("directory");
  });

  test("the directory can be entered afterwards", () => {
    const result = run("mkdir work && cd work && pwd");
    expect(result.events).toEqual([stdout("/home/alice/work\n")]);
  });

  test.each([
    ["docs", "File exists"],
    ["notes.txt", "File exists"],
    [".", "File exists"],
    ["/", "File exists"],
    ["missing/new", "No such file or directory"],
    ["notes.txt/new", "Not a directory"],
    ["locked/new", "Permission denied"],
    ["hidden/new", "Permission denied"],
    ["/srv/closed/new", "Permission denied"],
    ["''", "No such file or directory"],
  ])("mkdir %s: %s", (operand, message) => {
    const result = run(`mkdir ${operand}`);
    const name = operand === "''" ? "" : operand;
    expect(result.events).toEqual([
      stderr(`mkdir: cannot create directory ‘${name}’: ${message}\n`),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("goes on after an error and fails at the end", () => {
    const result = run("mkdir docs fresh");
    expect(result.events).toEqual([stderr("mkdir: cannot create directory ‘docs’: File exists\n")]);
    expect(result.session.exitStatus).toBe(1);
    expect(nodeAt(result.world, "/home/alice/fresh")?.kind).toBe("directory");
  });

  test("quotes names in errors like quote", () => {
    expect(run("mkdir 'it'\\''s/x'").events).toEqual([
      stderr("mkdir: cannot create directory ‘it's/x’: No such file or directory\n"),
    ]);
  });

  test("without operands is a usage error", () => {
    const result = run("mkdir");
    expect(result.events).toEqual([stderr(`mkdir: missing operand\n${TRY_HELP}`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test.each([
    ["mkdir -m 700 x", "-m"],
    ["mkdir --mode=700 x", "--mode"],
    ["mkdir -Z x", "-Z"],
    ["mkdir --context x", "--context"],
    ["mkdir --help", "--help"],
    ["mkdir --version", "--version"],
  ])("%s gives a notice", (input, option) => {
    expect(run(input).events).toEqual([
      { kind: "notice", command: "mkdir", notice: { key: "option-not-simulated", option } },
    ]);
  });

  test("an invalid option is a usage error", () => {
    expect(run("mkdir -x a").events).toEqual([stderr(`mkdir: invalid option -- 'x'\n${TRY_HELP}`)]);
  });
});

describe("mkdir -v", () => {
  test("writes a line for every directory it creates", () => {
    const result = run("mkdir -v a 'my dir' docs");
    expect(result.events).toEqual([
      stdout("mkdir: created directory 'a'\nmkdir: created directory 'my dir'\n"),
      stderr("mkdir: cannot create directory ‘docs’: File exists\n"),
    ]);
  });

  test("with -p, also for the directories on the way", () => {
    expect(run("mkdir -pv ./x/y/z").events).toEqual([
      stdout(
        "mkdir: created directory './x'\n" +
          "mkdir: created directory './x/y'\n" +
          "mkdir: created directory './x/y/z'\n",
      ),
    ]);
  });

  test("--verbose and --parents are the long names", () => {
    expect(run("mkdir --parents --verbose docs/a").events).toEqual([
      stdout("mkdir: created directory 'docs/a'\n"),
    ]);
  });
});

describe("mkdir -p", () => {
  test("creates the missing directories on the way", () => {
    const result = run("mkdir -p a/b/c");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    for (const path of ["/home/alice/a", "/home/alice/a/b", "/home/alice/a/b/c"]) {
      expect(nodeAt(result.world, path)).toMatchObject({ kind: "directory", mode: 0o775 });
    }
  });

  test("an existing directory is no error", () => {
    const result = run("mkdir -p docs . / /home/alice/docs/");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(result.world).toBe(world);
  });

  test("goes through existing directories, . and ..", () => {
    const result = run("mkdir -p ./docs/../docs//new/./more");
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/docs/new/more")?.kind).toBe("directory");
  });

  test("works with absolute paths", () => {
    const result = run("mkdir -p /home/alice/x/y");
    expect(nodeAt(result.world, "/home/alice/x/y")?.kind).toBe("directory");
  });

  test("keeps write and search for the owner of the directories on the way", () => {
    const strict: Session = { ...alice, umask: 0o777 };
    const result = run("mkdir -p a/b", strict);
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/a")?.mode).toBe(0o300);
    expect(nodeAt(result.world, "/home/alice/a/b")?.mode).toBe(0o000);
  });

  test.each([
    ["notes.txt", "File exists"],
    ["notes.txt/a/b", "Not a directory"],
    ["locked/a/b", "Permission denied"],
    ["hidden/a", "Permission denied"],
    ["/srv/closed/a/b", "Permission denied"],
    ["/root/a", "Permission denied"],
  ])("mkdir -p %s: %s", (operand, message) => {
    const result = run(`mkdir -p ${operand}`);
    expect(result.events).toEqual([
      stderr(`mkdir: cannot create directory ‘${operand}’: ${message}\n`),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("goes on with the next operand after an error", () => {
    const result = run("mkdir -p notes.txt/a b/c");
    expect(result.events).toEqual([
      stderr("mkdir: cannot create directory ‘notes.txt/a’: Not a directory\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
    expect(nodeAt(result.world, "/home/alice/b/c")?.kind).toBe("directory");
  });

  test("names the whole operand when a directory on the way fails", () => {
    const result = run("touch a && mkdir -pv x/y a/b");
    expect(result.events).toEqual([
      stdout("mkdir: created directory 'x'\nmkdir: created directory 'x/y'\n"),
      stderr("mkdir: cannot create directory ‘a/b’: Not a directory\n"),
    ]);
  });
});

describe("ancestorsOf", () => {
  test.each([
    ["a", [], "a"],
    ["a/b", [["a", "a"]], "b"],
    [
      "a/b/c",
      [
        ["a", "a"],
        ["a/b", "b"],
      ],
      "c",
    ],
    ["/a/b", [["/a", "/a"]], "b"],
    [
      "./a//b/",
      [
        [".", "."],
        ["./a", "a"],
      ],
      "b/",
    ],
    ["a//", [], "a//"],
    ["/", [], "/"],
    ["//a", [], "//a"],
    ["", [], ""],
  ])("%j", (file, ancestors, rest) => {
    expect(ancestorsOf(file)).toEqual({
      ancestors: ancestors.map(([prefix, component]) => ({ prefix, component })),
      rest,
    });
  });
});
