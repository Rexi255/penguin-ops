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

const BUILT = 1_700_000_000_000;
/** The time of the input: the clock moves one second per input. */
const NOW = BUILT + 1000;
/** The mtime of the reference file. */
const REFERENCE_TIME = 1_600_000_000_000;

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
          "/home/alice/notes.txt": { content: "hello\n", mode: 0o644 },
          "/home/alice/locked.txt": { content: "secret\n", mode: 0o444 },
          "/home/alice/old.txt": { content: "old\n", mtime: REFERENCE_TIME },
          "/home/alice/docs/": {},
          "/home/alice/readonly/": { mode: 0o555 },
          "/srv/shared.txt": { content: "", owner: "bob", mode: 0o666 },
          "/srv/bobs.txt": { content: "", owner: "bob", mode: 0o644 },
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

const TRY_HELP = "Try 'touch --help' for more information.\n";

describe("touch", () => {
  test("creates an empty file with the mode 0666 & ~umask", () => {
    const result = run("touch new.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/new.txt")).toEqual({
      kind: "file",
      owner: 1000,
      group: 1000,
      mode: 0o664,
      mtime: NOW,
      content: "",
    });
    expect(nodeAt(result.world, "/home/alice")?.mtime).toBe(NOW);
  });

  test("sets the time of an existing file and keeps its content", () => {
    const result = run("touch old.txt");
    expect(nodeAt(result.world, "/home/alice/old.txt")).toMatchObject({
      content: "old\n",
      mtime: NOW,
    });
    expect(nodeAt(result.world, "/home/alice")?.mtime).toBe(BUILT);
  });

  test("sets the time of a directory", () => {
    const result = run("touch docs /home/alice/docs/");
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/docs")?.mtime).toBe(NOW);
  });

  test("touches several files", () => {
    const result = run("touch a b old.txt");
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/a")?.kind).toBe("file");
    expect(nodeAt(result.world, "/home/alice/b")?.kind).toBe("file");
  });

  test("the owner may touch a file without write permission", () => {
    const result = run("touch locked.txt");
    expect(result.events).toEqual([]);
    expect(nodeAt(result.world, "/home/alice/locked.txt")?.mtime).toBe(NOW);
  });

  test("others may touch a file they may write to", () => {
    const result = run("touch /srv/shared.txt");
    expect(result.events).toEqual([]);
    expect(nodeAt(result.world, "/srv/shared.txt")?.mtime).toBe(NOW);
  });

  test("- touches the file of standard output", () => {
    const result = run("touch -r old.txt - >> notes.txt");
    expect(result.events).toEqual([]);
    expect(nodeAt(result.world, "/home/alice/notes.txt")?.mtime).toBe(REFERENCE_TIME);
  });

  test("- on the terminal or a pipe works and changes no file", () => {
    expect(run("touch -").session.exitStatus).toBe(0);
    expect(run("touch - | cat").session.exitStatus).toBe(0);
  });

  test("@differential - fails like futimens(2) for a file of standard output it does not own", () => {
    const result = run("touch -r old.txt - >> /srv/shared.txt");
    expect(result.events).toEqual([
      stderr("touch: setting times of '-': Operation not permitted\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
  });
});

describe("touch: errors", () => {
  test.each([
    ["missing/new", "cannot touch 'missing/new': No such file or directory"],
    ["notes.txt/new", "cannot touch 'notes.txt/new': Not a directory"],
    ["readonly/new", "cannot touch 'readonly/new': Permission denied"],
    ["/srv/closed/new", "cannot touch '/srv/closed/new': Permission denied"],
    ["/srv/bobs.txt", "cannot touch '/srv/bobs.txt': Permission denied"],
    ["/srv", "setting times of '/srv': Permission denied"],
    ["new/", "setting times of 'new/': No such file or directory"],
    ["notes.txt/", "setting times of 'notes.txt/': Not a directory"],
    ["''", "cannot touch '': No such file or directory"],
  ])("touch %s: %s", (operand, message) => {
    const result = run(`touch ${operand}`);
    expect(result.events).toEqual([stderr(`touch: ${message}\n`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("goes on after an error", () => {
    const result = run("touch missing/new fresh.txt");
    expect(result.session.exitStatus).toBe(1);
    expect(nodeAt(result.world, "/home/alice/fresh.txt")?.kind).toBe("file");
  });

  test("without operands is a usage error", () => {
    const result = run("touch");
    expect(result.events).toEqual([stderr(`touch: missing file operand\n${TRY_HELP}`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("an invalid option is a usage error", () => {
    expect(run("touch -x a").events).toEqual([stderr(`touch: invalid option -- 'x'\n${TRY_HELP}`)]);
  });

  test.each([
    ["touch -d yesterday a", "-d"],
    ["touch --date=now a", "--date"],
    ["touch -t 202401011200 a", "-t"],
    ["touch --time=atime a", "--time"],
    ["touch --help", "--help"],
    ["touch --version", "--version"],
  ])("%s gives a notice", (input, option) => {
    expect(run(input).events).toEqual([
      { kind: "notice", command: "touch", notice: { key: "option-not-simulated", option } },
    ]);
  });
});

describe("touch -c", () => {
  test.each(["-c", "--no-create"])("%s creates nothing and is no error", (option) => {
    const result = run(`touch ${option} new.txt missing/new`);
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/new.txt")).toBeUndefined();
  });

  test("still sets the time of an existing file", () => {
    const result = run("touch -c old.txt");
    expect(nodeAt(result.world, "/home/alice/old.txt")?.mtime).toBe(NOW);
  });

  test("reports why the time of an existing file cannot be set", () => {
    expect(run("touch -c /srv/bobs.txt").events).toEqual([
      stderr("touch: setting times of '/srv/bobs.txt': Permission denied\n"),
    ]);
  });
});

describe("touch -h", () => {
  test.each(["-h", "--no-dereference"])(
    "%s creates nothing and reports a missing file",
    (option) => {
      const result = run(`touch ${option} new.txt`);
      expect(result.events).toEqual([
        stderr("touch: setting times of 'new.txt': No such file or directory\n"),
      ]);
      expect(result.session.exitStatus).toBe(1);
    },
  );

  test("sets the time of an existing file, as the game has no symbolic links", () => {
    expect(nodeAt(run("touch -h old.txt").world, "/home/alice/old.txt")?.mtime).toBe(NOW);
  });
});

describe("touch -a and -m", () => {
  test("-m sets the modification time", () => {
    expect(nodeAt(run("touch -m old.txt").world, "/home/alice/old.txt")?.mtime).toBe(NOW);
  });

  test("-a keeps the modification time but creates a missing file", () => {
    const result = run("touch -a old.txt new.txt");
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/old.txt")?.mtime).toBe(REFERENCE_TIME);
    expect(nodeAt(result.world, "/home/alice/new.txt")?.mtime).toBe(NOW);
  });

  test("-a and -m together are like neither", () => {
    expect(nodeAt(run("touch -am old.txt").world, "/home/alice/old.txt")?.mtime).toBe(NOW);
    expect(run("touch -am /srv/shared.txt").events).toEqual([]);
  });

  test.each(["-a", "-m"])(
    "@differential %s needs the owner, also with write permission",
    (option) => {
      expect(run(`touch ${option} /srv/shared.txt`).events).toEqual([
        stderr("touch: setting times of '/srv/shared.txt': Operation not permitted\n"),
      ]);
    },
  );

  test("-f is ignored", () => {
    expect(nodeAt(run("touch -f old.txt").world, "/home/alice/old.txt")?.mtime).toBe(NOW);
  });
});

describe("touch -r", () => {
  test.each(["-r old.txt", "--reference=old.txt", "--ref old.txt"])(
    "%s copies the time of the reference file",
    (option) => {
      const result = run(`touch ${option} notes.txt new.txt`);
      expect(result.session.exitStatus).toBe(0);
      expect(nodeAt(result.world, "/home/alice/notes.txt")?.mtime).toBe(REFERENCE_TIME);
      expect(nodeAt(result.world, "/home/alice/new.txt")?.mtime).toBe(REFERENCE_TIME);
    },
  );

  test("the last reference wins", () => {
    const result = run("touch -r notes.txt -r old.txt docs");
    expect(nodeAt(result.world, "/home/alice/docs")?.mtime).toBe(REFERENCE_TIME);
  });

  test("with -a, the modification time stays", () => {
    const result = run("touch -a -r old.txt notes.txt");
    expect(nodeAt(result.world, "/home/alice/notes.txt")?.mtime).toBe(BUILT);
  });

  test("needs the owner", () => {
    expect(run("touch -r old.txt /srv/shared.txt").events).toEqual([
      stderr("touch: setting times of '/srv/shared.txt': Operation not permitted\n"),
    ]);
  });

  test("a missing reference file ends touch before it touches anything", () => {
    const result = run("touch -r missing.txt new.txt");
    expect(result.events).toEqual([
      stderr("touch: failed to get attributes of 'missing.txt': No such file or directory\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
    expect(nodeAt(result.world, "/home/alice/new.txt")).toBeUndefined();
  });

  test("a missing reference file comes before a missing operand", () => {
    expect(run("touch -r /srv/closed/x").events).toEqual([
      stderr("touch: failed to get attributes of '/srv/closed/x': Permission denied\n"),
    ]);
  });
});
