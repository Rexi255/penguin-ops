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
          "/home/alice/a.txt": "a\n",
          "/home/alice/b.txt": "b\n",
          "/home/alice/locked.txt": { content: "locked\n", mode: 0o444 },
          "/home/alice/locked-empty.txt": { content: "", mode: 0o444 },
          "/home/alice/-x": "dash\n",
          "/home/alice/my file.txt": "spaced\n",
          "/home/alice/empty/": {},
          "/home/alice/tree/top.txt": "top\n",
          "/home/alice/tree/sub/deep.txt": "deep\n",
          "/home/alice/single/only.txt": "only\n",
          "/home/alice/mixed/free.txt": "free\n",
          "/home/alice/mixed/stuck/": { mode: 0o555 },
          "/home/alice/mixed/stuck/kept.txt": "kept\n",
          "/home/alice/ro-full/": { mode: 0o555 },
          "/home/alice/ro-full/x.txt": "x\n",
          "/home/alice/ro-empty/": { mode: 0o555 },
          "/home/alice/unreadable-empty/": { mode: 0o300 },
          "/home/alice/unreadable-full/": { mode: 0o300 },
          "/home/alice/unreadable-full/x.txt": "x\n",
          "/home/alice/unsearchable/": { mode: 0o600 },
          "/home/alice/sealed/": { mode: 0o100 },
          "/home/alice/unsearchable/x.txt": "x\n",
          "/tmp/": { mode: 0o1777 },
          "/tmp/bob.txt": { content: "", owner: "bob" },
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

const QUESTION_NOTICE: ShellEvent = {
  kind: "notice",
  command: "rm",
  notice: { key: "terminal-input-not-simulated" },
};

function nodeAt(current: World, path: string): FsNode | undefined {
  const host = findHost(current, "ws01");
  if (host === undefined) {
    throw new Error("no host ws01");
  }
  const found = lookup(host.root, root.credentials, "/", path);
  return found.ok ? found.node : undefined;
}

function exists(current: World, path: string): boolean {
  return nodeAt(current, path) !== undefined;
}

const TRY_HELP = "Try 'rm --help' for more information.\n";

describe("rm with files", () => {
  test("removes files", () => {
    const result = run("rm a.txt '/home/alice/my file.txt'");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(exists(result.world, "/home/alice/a.txt")).toBe(false);
    expect(exists(result.world, "/home/alice/my file.txt")).toBe(false);
    expect(exists(result.world, "/home/alice/b.txt")).toBe(true);
  });

  test("reports a missing file and goes on", () => {
    const result = run("rm missing.txt a.txt");
    expect(result.events).toEqual([
      stderr("rm: cannot remove 'missing.txt': No such file or directory\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
    expect(exists(result.world, "/home/alice/a.txt")).toBe(false);
  });

  test.each([
    ["a.txt/x", "Not a directory"],
    ["a.txt/", "Not a directory"],
    ["''", "No such file or directory"],
    ["ro-full/x.txt", "Permission denied"],
    ["unsearchable/x.txt", "Permission denied"],
  ])("rm %s: %s", (operand, message) => {
    const result = run(`rm ${operand}`);
    const name = operand === "''" ? "" : operand;
    expect(result.events).toEqual([stderr(`rm: cannot remove '${name}': ${message}\n`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("a file named twice is missing the second time", () => {
    expect(run("rm a.txt a.txt").events).toEqual([
      stderr("rm: cannot remove 'a.txt': No such file or directory\n"),
    ]);
  });

  test("without operands is a usage error", () => {
    const result = run("rm");
    expect(result.events).toEqual([stderr(`rm: missing operand\n${TRY_HELP}`)]);
    expect(result.session.exitStatus).toBe(1);
  });
});

describe("rm -f", () => {
  test.each(["-f", "--force"])("%s ignores missing files", (option) => {
    const result = run(`rm ${option} missing.txt missing/x a.txt/x a.txt`);
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(exists(result.world, "/home/alice/a.txt")).toBe(false);
  });

  test("still reports other errors", () => {
    expect(run("rm -f ro-full/x.txt").events).toEqual([
      stderr("rm: cannot remove 'ro-full/x.txt': Permission denied\n"),
    ]);
  });

  test("without operands is no error", () => {
    const result = run("rm -f");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("reports the sticky bit of a directory", () => {
    expect(run("rm -f /tmp/bob.txt").events).toEqual([
      stderr("rm: cannot remove '/tmp/bob.txt': Operation not permitted\n"),
    ]);
  });

  test("removes write-protected files without asking", () => {
    const result = run("rm -f locked.txt");
    expect(result.events).toEqual([]);
    expect(exists(result.world, "/home/alice/locked.txt")).toBe(false);
  });
});

describe("rm: questions on the terminal", () => {
  test("asks before it removes a write-protected file, which stops the input", () => {
    const result = run("rm a.txt locked.txt b.txt; echo next");
    expect(result.events).toEqual([
      stderr("rm: remove write-protected regular file 'locked.txt'? "),
      QUESTION_NOTICE,
    ]);
    expect(result.session.exitStatus).toBe(1);
    // What rm removed before it asked is gone; the rest stays.
    expect(exists(result.world, "/home/alice/a.txt")).toBe(false);
    expect(exists(result.world, "/home/alice/locked.txt")).toBe(true);
    expect(exists(result.world, "/home/alice/b.txt")).toBe(true);
  });

  test("names an empty file as such", () => {
    expect(run("rm locked-empty.txt").events).toEqual([
      stderr("rm: remove write-protected regular empty file 'locked-empty.txt'? "),
      QUESTION_NOTICE,
    ]);
  });

  test("does not ask when standard input is not the terminal", () => {
    const result = run("echo y | rm locked.txt");
    expect(result.events).toEqual([]);
    expect(exists(result.world, "/home/alice/locked.txt")).toBe(false);
    expect(exists(run("rm locked.txt < a.txt").world, "/home/alice/locked.txt")).toBe(false);
  });

  test("does not ask root, who may write to every file", () => {
    const result = run("rm /home/alice/locked.txt", root);
    expect(result.events).toEqual([]);
    expect(exists(result.world, "/home/alice/locked.txt")).toBe(false);
  });

  test("asks before it descends into a write-protected directory", () => {
    expect(run("rm -r ro-full").events).toEqual([
      stderr("rm: descend into write-protected directory 'ro-full'? "),
      QUESTION_NOTICE,
    ]);
  });

  test("asks before it removes an empty write-protected directory", () => {
    const question = stderr("rm: remove write-protected directory 'ro-empty'? ");
    expect(run("rm -r ro-empty").events).toEqual([question, QUESTION_NOTICE]);
    expect(run("rm -d ro-empty").events).toEqual([question, QUESTION_NOTICE]);
  });

  test("a write-protected directory it cannot read is an error with -r", () => {
    expect(run("rm -r sealed").events).toEqual([
      stderr("rm: cannot remove 'sealed': Permission denied\n"),
    ]);
  });

  test("-d asks before it tries to remove a write-protected directory it cannot read", () => {
    expect(run("rm -d sealed").events).toEqual([
      stderr("rm: attempt removal of inaccessible directory 'sealed'? "),
      QUESTION_NOTICE,
    ]);
    expect(run("rm -rd sealed").events).toEqual([
      stderr("rm: remove write-protected directory 'sealed'? "),
      QUESTION_NOTICE,
    ]);
  });

  test("asks inside a tree, after removing what came before", () => {
    const result = run("rm -r a.txt tree locked.txt");
    expect(result.events).toEqual([
      stderr("rm: remove write-protected regular file 'locked.txt'? "),
      QUESTION_NOTICE,
    ]);
    expect(exists(result.world, "/home/alice/tree")).toBe(false);
  });
});

describe("rm with directories", () => {
  test("refuses a directory without -r or -d", () => {
    const result = run("rm empty a.txt");
    expect(result.events).toEqual([stderr("rm: cannot remove 'empty': Is a directory\n")]);
    expect(result.session.exitStatus).toBe(1);
    expect(exists(result.world, "/home/alice/empty")).toBe(true);
    expect(exists(result.world, "/home/alice/a.txt")).toBe(false);
  });

  test.each(["-d", "--dir"])("%s removes an empty directory", (option) => {
    const result = run(`rm ${option} empty/`);
    expect(result.events).toEqual([]);
    expect(exists(result.world, "/home/alice/empty")).toBe(false);
  });

  test("-d refuses a directory with entries", () => {
    expect(run("rm -d tree").events).toEqual([
      stderr("rm: cannot remove 'tree': Directory not empty\n"),
    ]);
  });

  test("-d removes an empty directory it cannot read", () => {
    expect(exists(run("rm -d unreadable-empty").world, "/home/alice/unreadable-empty")).toBe(false);
  });

  test.each(["-r", "-R", "--recursive"])(
    "%s removes a directory with everything in it",
    (option) => {
      const result = run(`rm ${option} tree`);
      expect(result.events).toEqual([]);
      expect(result.session.exitStatus).toBe(0);
      expect(exists(result.world, "/home/alice/tree")).toBe(false);
    },
  );

  test("-r removes files and empty directories too", () => {
    const result = run("rm -r a.txt empty");
    expect(exists(result.world, "/home/alice/a.txt")).toBe(false);
    expect(exists(result.world, "/home/alice/empty")).toBe(false);
  });

  test("-r keeps the directories above an entry it cannot remove, without a message for them", () => {
    const result = run("rm -rf mixed");
    expect(result.events).toEqual([
      stderr("rm: cannot remove 'mixed/stuck/kept.txt': Permission denied\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
    expect(exists(result.world, "/home/alice/mixed/free.txt")).toBe(false);
    expect(exists(result.world, "/home/alice/mixed/stuck/kept.txt")).toBe(true);
  });

  test("-r removes an empty directory it cannot read", () => {
    expect(exists(run("rm -r unreadable-empty").world, "/home/alice/unreadable-empty")).toBe(false);
  });

  test("-r reports why a directory with entries could not be read", () => {
    expect(run("rm -r unreadable-full").events).toEqual([
      stderr("rm: cannot remove 'unreadable-full': Permission denied\n"),
    ]);
  });

  test("-r cannot remove the entries of a directory it cannot search", () => {
    expect(run("rm -r unsearchable").events).toEqual([
      stderr("rm: cannot remove 'unsearchable/x.txt': Permission denied\n"),
    ]);
  });

  test("-r with trailing slashes keeps one in the names", () => {
    expect(run("rm -rv single///").events).toEqual([
      stdout("removed 'single/only.txt'\nremoved directory 'single/'\n"),
    ]);
  });

  test("-rf ignores missing operands", () => {
    const result = run("rm -rf missing tree");
    expect(result.events).toEqual([]);
    expect(exists(result.world, "/home/alice/tree")).toBe(false);
  });
});

describe("rm -v", () => {
  test("writes a line for every file and directory it removes", () => {
    expect(run("rm -v a.txt 'my file.txt'").events).toEqual([
      stdout("removed 'a.txt'\nremoved 'my file.txt'\n"),
    ]);
  });

  test("@differential writes the entries of a directory in the order of the directory", () => {
    expect(run("rm -rv tree").events).toEqual([
      stdout(
        "removed 'tree/top.txt'\n" +
          "removed 'tree/sub/deep.txt'\n" +
          "removed directory 'tree/sub'\n" +
          "removed directory 'tree'\n",
      ),
    ]);
  });
});

describe("rm: protected operands", () => {
  test.each([".", "..", "./", "empty/.", "tree/..", "/home/.."])("-r refuses %s", (operand) => {
    const result = run(`rm -r ${operand}`);
    expect(result.events).toEqual([
      stderr(`rm: refusing to remove '.' or '..' directory: skipping '${operand}'\n`),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("without -r, . is just a directory", () => {
    expect(run("rm .").events).toEqual([stderr("rm: cannot remove '.': Is a directory\n")]);
  });

  test("-r refuses /", () => {
    const result = run("rm -rf /", root);
    expect(result.events).toEqual([
      stderr(
        "rm: it is dangerous to operate recursively on '/'\n" +
          "rm: use --no-preserve-root to override this failsafe\n",
      ),
    ]);
    expect(result.session.exitStatus).toBe(1);
    expect(result.world).toBe(world);
  });

  test("@differential -r refuses other names of /", () => {
    expect(run("rm -r // /home/../", root).events).toEqual([
      stderr(
        "rm: it is dangerous to operate recursively on '//' (same as '/')\n" +
          "rm: use --no-preserve-root to override this failsafe\n" +
          "rm: refusing to remove '.' or '..' directory: skipping '/home/../'\n",
      ),
    ]);
  });

  test("three slashes become one", () => {
    expect(run("rm -r ///", root).events.at(0)).toEqual(
      stderr(
        "rm: it is dangerous to operate recursively on '/'\n" +
          "rm: use --no-preserve-root to override this failsafe\n",
      ),
    );
  });

  test("--preserve-root and --preserve-root=all change nothing in the game", () => {
    const result = run("rm -r --preserve-root=all tree; rm --preserve-root a.txt");
    expect(result.events).toEqual([]);
    expect(exists(result.world, "/home/alice/tree")).toBe(false);
  });

  test("--preserve-root=all skips a directory whose .. cannot be found", () => {
    expect(run("rm -rd --preserve-root=all unsearchable").events).toEqual([
      stderr("rm: failed to stat 'unsearchable/..': skipping 'unsearchable'\n"),
    ]);
  });

  test("--preserve-root with another argument is an error", () => {
    const result = run("rm --preserve-root=yes a.txt");
    expect(result.events).toEqual([stderr("rm: unrecognized --preserve-root argument: 'yes'\n")]);
    expect(result.session.exitStatus).toBe(1);
  });
});

describe("rm: options", () => {
  test("an invalid option suggests ./ for a file whose name starts with -", () => {
    const result = run("rm -x");
    expect(result.events).toEqual([
      stderr(`rm: invalid option -- 'x'\nTry 'rm ./-x' to remove the file '-x'.\n${TRY_HELP}`),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("the hint is left out when no such file exists", () => {
    expect(run("rm -q").events).toEqual([stderr(`rm: invalid option -- 'q'\n${TRY_HELP}`)]);
  });

  test("-- ends the options, so a name with - can be removed", () => {
    const result = run("rm -- -x");
    expect(result.events).toEqual([]);
    expect(exists(result.world, "/home/alice/-x")).toBe(false);
    expect(exists(run("rm ./-x").world, "/home/alice/-x")).toBe(false);
  });

  test.each([
    ["rm -i a.txt", "-i"],
    ["rm -I a.txt", "-I"],
    ["rm --interactive=never a.txt", "--interactive"],
    ["rm --one-file-system a.txt", "--one-file-system"],
    ["rm -rf --no-preserve-root /", "--no-preserve-root"],
    ["rm ---presume-input-tty a.txt", "---presume-input-tty"],
    ["rm --help", "--help"],
    ["rm --version", "--version"],
  ])("%s gives a notice", (input, option) => {
    expect(run(input).events).toEqual([
      { kind: "notice", command: "rm", notice: { key: "option-not-simulated", option } },
    ]);
  });
});
