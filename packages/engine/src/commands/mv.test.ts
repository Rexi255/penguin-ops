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

const START = 1_700_000_000_000;

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [
          { name: "root", gid: 0 },
          { name: "alice", gid: 1000 },
          { name: "bob", gid: 1001 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "alice", uid: 1000 },
          { name: "bob", uid: 1001 },
        ],
        files: {
          "/home/alice/a.txt": "alpha\n",
          "/home/alice/b.txt": "beta\n",
          "/home/alice/locked.txt": { content: "locked\n", mode: 0o444 },
          "/home/alice/x/f": "from x\n",
          "/home/alice/y/f": "from y\n",
          "/home/alice/dir/": {},
          "/home/alice/empty/": {},
          "/home/alice/full/in.txt": "in\n",
          "/home/alice/tree/top.txt": "top\n",
          "/home/alice/ro/": { mode: 0o555 },
          "/home/alice/ro/in.txt": "in\n",
          "/tmp/": { mode: 0o1777 },
          "/tmp/bob.txt": { content: "bob\n", owner: "bob" },
        },
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
  const host = findHost(current, "ws01");
  if (host === undefined) {
    throw new Error("no host ws01");
  }
  const found = lookup(host.root, root.credentials, "/", path);
  return found.ok ? found.node : undefined;
}

function contentOf(current: World, path: string): string | undefined {
  const node = nodeAt(current, path);
  return node?.kind === "file" ? node.content : undefined;
}

const TRY_HELP = "Try 'mv --help' for more information.\n";

describe("mv: rename", () => {
  test("renames a file", () => {
    const result = run("mv a.txt c.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/a.txt")).toBeUndefined();
    expect(contentOf(result.world, "/home/alice/c.txt")).toBe("alpha\n");
  });

  test("replaces an existing file", () => {
    const result = run("mv a.txt b.txt");
    expect(result.events).toEqual([]);
    expect(contentOf(result.world, "/home/alice/b.txt")).toBe("alpha\n");
  });

  test("renames a directory with everything in it", () => {
    const result = run("mv tree forest");
    expect(contentOf(result.world, "/home/alice/forest/top.txt")).toBe("top\n");
  });

  test("-v names every rename", () => {
    expect(run("mv -v a.txt c.txt").events).toEqual([stdout("renamed 'a.txt' -> 'c.txt'\n")]);
    expect(run("mv -v a.txt b.txt").events).toEqual([stdout("renamed 'a.txt' -> 'b.txt'\n")]);
  });

  test("-T replaces an empty directory", () => {
    const result = run("mv -T tree empty");
    expect(result.events).toEqual([]);
    expect(contentOf(result.world, "/home/alice/empty/top.txt")).toBe("top\n");
  });

  test("-T cannot replace a directory with entries", () => {
    expect(run("mv -T tree full").events).toEqual([
      stderr("mv: cannot overwrite 'full': Directory not empty\n"),
    ]);
  });
});

describe("mv: into a directory", () => {
  test("moves sources into the last operand under their last component", () => {
    const result = run("mv a.txt tree/ dir");
    expect(result.session.exitStatus).toBe(0);
    expect(contentOf(result.world, "/home/alice/dir/a.txt")).toBe("alpha\n");
    expect(contentOf(result.world, "/home/alice/dir/tree/top.txt")).toBe("top\n");
  });

  test("moves into an existing directory with two operands", () => {
    expect(run("mv -v a.txt dir").events).toEqual([stdout("renamed 'a.txt' -> 'dir/a.txt'\n")]);
  });

  test("-t names the target directory first", () => {
    const result = run("mv -t dir a.txt b.txt");
    expect(contentOf(result.world, "/home/alice/dir/b.txt")).toBe("beta\n");
  });

  test("does not overwrite a file it just moved there", () => {
    const result = run("mv x/f y/f dir");
    expect(result.events).toEqual([
      stderr("mv: will not overwrite just-created 'dir/f' with 'y/f'\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
    expect(contentOf(result.world, "/home/alice/dir/f")).toBe("from x\n");
    expect(contentOf(result.world, "/home/alice/y/f")).toBe("from y\n");
  });

  test("--strip-trailing-slashes removes them from the sources", () => {
    expect(run("mv -v --strip-trailing-slashes tree// dir").events).toEqual([
      stdout("renamed 'tree' -> 'dir/tree'\n"),
    ]);
  });

  test("--no-copy changes nothing in the game", () => {
    expect(run("mv --no-copy a.txt c.txt").session.exitStatus).toBe(0);
  });
});

describe("mv: errors", () => {
  test.each([
    ["mv missing.txt c.txt", "cannot stat 'missing.txt': No such file or directory"],
    ["mv a.txt a.txt", "'a.txt' and 'a.txt' are the same file"],
    ["mv a.txt ./a.txt", "'a.txt' and './a.txt' are the same file"],
    ["mv a.txt nodir/c.txt", "cannot move 'a.txt' to 'nodir/c.txt': No such file or directory"],
    ["mv a.txt c.txt/", "cannot move 'a.txt' to 'c.txt/': Not a directory"],
    ["mv ro/in.txt c.txt", "cannot move 'ro/in.txt' to 'c.txt': Permission denied"],
    ["mv a.txt ro", "cannot move 'a.txt' to 'ro/a.txt': Permission denied"],
    ["mv tree tree", "cannot move 'tree' to a subdirectory of itself, 'tree/tree'"],
    ["mv tree tree/sub", "cannot move 'tree' to a subdirectory of itself, 'tree/sub'"],
    ["mv tree a.txt", "cannot overwrite non-directory 'a.txt' with directory 'tree'"],
    ["mv -T a.txt dir", "cannot overwrite directory 'dir' with non-directory 'a.txt'"],
    ["mv a.txt b.txt c.txt", "target 'c.txt': No such file or directory"],
    ["mv a.txt b.txt locked.txt", "target 'locked.txt': Not a directory"],
    [
      "mv -f /tmp/bob.txt /tmp/x",
      "cannot move '/tmp/bob.txt' to '/tmp/x': Operation not permitted",
    ],
  ])("%s: %s", (input, message) => {
    const result = run(input);
    expect(result.events).toEqual([stderr(`mv: ${message}\n`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("goes on with the next source after an error", () => {
    const result = run("mv missing.txt a.txt dir");
    expect(result.session.exitStatus).toBe(1);
    expect(contentOf(result.world, "/home/alice/dir/a.txt")).toBe("alpha\n");
  });

  test.each([
    ["mv", `missing file operand\n${TRY_HELP}`],
    ["mv a.txt", `missing destination file operand after 'a.txt'\n${TRY_HELP}`],
    ["mv -T a b c", `extra operand 'c'\n${TRY_HELP}`],
    ["mv -T -t dir a", "cannot combine --target-directory (-t) and --no-target-directory (-T)\n"],
    ["mv -t missing a.txt", "target directory 'missing': No such file or directory\n"],
    ["mv -t dir -t dir a.txt", "multiple target directories specified\n"],
  ])("%s is an error", (input, message) => {
    const result = run(input);
    expect(result.events).toEqual([stderr(`mv: ${message}`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a source named twice is gone the second time", () => {
    const result = run("mv /home/alice/ro /home/alice/ro /home/alice/empty", root);
    expect(result.events).toEqual([
      stderr("mv: cannot stat '/home/alice/ro': No such file or directory\n"),
    ]);
    expect(nodeAt(result.world, "/home/alice/empty/ro")?.kind).toBe("directory");
  });

  test("a directory that cannot be moved and is named twice gets a warning the second time", () => {
    const result = run("mv full full ro");
    expect(result.events).toEqual([
      stderr(
        "mv: cannot move 'full' to 'ro/full': Permission denied\n" +
          "mv: warning: source directory 'full' specified more than once\n",
      ),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });
});

describe("mv: questions on the terminal", () => {
  test("asks before it replaces a destination the user may not write to", () => {
    const result = run("mv b.txt dir; mv a.txt locked.txt; echo no");
    expect(result.events).toEqual([
      stderr("mv: replace 'locked.txt', overriding mode 0444 (r--r--r--)? "),
      { kind: "notice", command: "mv", notice: { key: "terminal-input-not-simulated" } },
    ]);
    expect(contentOf(result.world, "/home/alice/dir/b.txt")).toBe("beta\n");
    expect(contentOf(result.world, "/home/alice/locked.txt")).toBe("locked\n");
  });

  test("-f replaces it without asking", () => {
    const result = run("mv -f a.txt locked.txt");
    expect(result.events).toEqual([]);
    expect(contentOf(result.world, "/home/alice/locked.txt")).toBe("alpha\n");
  });

  test("does not ask when standard input is not the terminal", () => {
    expect(contentOf(run("echo | mv a.txt locked.txt").world, "/home/alice/locked.txt")).toBe(
      "alpha\n",
    );
  });
});

describe("mv: options that give a notice", () => {
  test.each([
    ["mv -i a.txt b.txt", "-i"],
    ["mv -n a.txt b.txt", "-n"],
    ["mv -u a.txt b.txt", "-u"],
    ["mv -b a.txt b.txt", "-b"],
    ["mv --exchange a.txt b.txt", "--exchange"],
    ["mv --help", "--help"],
  ])("%s", (input, option) => {
    expect(run(input).events).toEqual([
      { kind: "notice", command: "mv", notice: { key: "option-not-simulated", option } },
    ]);
  });
});
