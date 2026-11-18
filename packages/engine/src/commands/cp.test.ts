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
import { fileNameConcat, lastComponent, nameInDirectory, stripTrailingSlashes } from "./file-names";

const BUILT = 1_700_000_000_000;
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
          "/home/alice/a.txt": { content: "alpha\n", mode: 0o640 },
          "/home/alice/b.txt": "beta\n",
          "/home/alice/run.sh": { content: "echo hi\n", mode: 0o4755 },
          "/home/alice/old.txt": { content: "old\n", mode: 0o600 },
          "/home/alice/locked.txt": { content: "locked\n", mode: 0o444 },
          "/home/alice/secret.txt": { content: "secret\n", mode: 0o200 },
          "/home/alice/x/f": "from x\n",
          "/home/alice/y/f": "from y\n",
          "/home/alice/dir/": {},
          "/home/alice/ro/": { mode: 0o555 },
          "/home/alice/ro/in.txt": { content: "in\n", mode: 0o444 },
          "/home/alice/tree/top.txt": "top\n",
          "/home/alice/tree/sub/deep.txt": "deep\n",
          "/home/alice/shared/": { mode: 0o775 },
          "/home/alice/shared/s.txt": "s\n",
          "/home/alice/sealed/": { mode: 0o500 },
          "/home/alice/sealed/in.txt": "in\n",
          "/home/alice/closed/": { mode: 0o300 },
          "/home/alice/copy/top.txt": "older top\n",
        },
      },
    ],
  },
  createGameClock(BUILT),
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

const TRY_HELP = "Try 'cp --help' for more information.\n";

describe("cp: files", () => {
  test("copies a file to a new name with the source's bits minus the umask", () => {
    const result = run("cp a.txt new.txt");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/new.txt")).toEqual({
      kind: "file",
      owner: 1000,
      group: 1000,
      mode: 0o640,
      mtime: NOW,
      content: "alpha\n",
    });
  });

  test("does not copy the setuid bit", () => {
    expect(nodeAt(run("cp run.sh copy.sh").world, "/home/alice/copy.sh")?.mode).toBe(0o755);
  });

  test("overwrites an existing file and keeps its mode", () => {
    const result = run("cp a.txt old.txt");
    expect(nodeAt(result.world, "/home/alice/old.txt")).toMatchObject({
      content: "alpha\n",
      mode: 0o600,
      mtime: NOW,
    });
  });

  test("copies into a directory under the last component", () => {
    const result = run("cp a.txt /home/alice/b.txt dir/");
    expect(result.session.exitStatus).toBe(0);
    expect(contentOf(result.world, "/home/alice/dir/a.txt")).toBe("alpha\n");
    expect(contentOf(result.world, "/home/alice/dir/b.txt")).toBe("beta\n");
  });

  test("-t names the target directory first", () => {
    const result = run("cp -t dir a.txt b.txt");
    expect(contentOf(result.world, "/home/alice/dir/b.txt")).toBe("beta\n");
    expect(contentOf(run("cp --target-directory=dir a.txt").world, "/home/alice/dir/a.txt")).toBe(
      "alpha\n",
    );
  });

  test("-T copies onto the last operand even if it is a directory", () => {
    expect(run("cp -T a.txt dir").events).toEqual([
      stderr("cp: cannot overwrite directory 'dir' with non-directory 'a.txt'\n"),
    ]);
    expect(contentOf(run("cp -T a.txt c.txt").world, "/home/alice/c.txt")).toBe("alpha\n");
  });

  test("-v names every copy", () => {
    expect(run("cp -v a.txt b.txt dir").events).toEqual([
      stdout("'a.txt' -> 'dir/a.txt'\n'b.txt' -> 'dir/b.txt'\n"),
    ]);
  });

  test("a file named twice is copied once, with a warning", () => {
    const result = run("cp a.txt a.txt dir");
    expect(result.events).toEqual([
      stderr("cp: warning: source file 'a.txt' specified more than once\n"),
    ]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("does not overwrite a file it just created", () => {
    const result = run("cp x/f y/f dir");
    expect(result.events).toEqual([
      stderr("cp: will not overwrite just-created 'dir/f' with 'y/f'\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
    expect(contentOf(result.world, "/home/alice/dir/f")).toBe("from x\n");
  });
});

describe("cp: errors", () => {
  test.each([
    ["cp missing.txt new.txt", "cannot stat 'missing.txt': No such file or directory"],
    ["cp a.txt nodir/x", "cannot create regular file 'nodir/x': No such file or directory"],
    ["cp a.txt b.txt/x", "cannot stat 'b.txt/x': Not a directory"],
    ["cp a.txt new/", "cannot create regular file 'new/': Not a directory"],
    ["cp a.txt a.txt", "'a.txt' and 'a.txt' are the same file"],
    ["cp a.txt ./a.txt", "'a.txt' and './a.txt' are the same file"],
    ["cp tree copy2", "-r not specified; omitting directory 'tree'"],
    ["cp secret.txt new.txt", "cannot open 'secret.txt' for reading: Permission denied"],
    ["cp a.txt ro", "cannot create regular file 'ro/a.txt': Permission denied"],
    ["cp a.txt locked.txt", "cannot create regular file 'locked.txt': Permission denied"],
    ["cp a.txt b.txt c.txt", "target 'c.txt': No such file or directory"],
    ["cp a.txt b.txt old.txt", "target 'old.txt': Not a directory"],
  ])("%s: %s", (input, message) => {
    const result = run(input);
    expect(result.events).toEqual([stderr(`cp: ${message}\n`)]);
    expect(result.session.exitStatus).toBe(1);
  });

  test("goes on with the next source after an error", () => {
    const result = run("cp missing.txt a.txt dir");
    expect(result.session.exitStatus).toBe(1);
    expect(contentOf(result.world, "/home/alice/dir/a.txt")).toBe("alpha\n");
  });

  test.each([
    ["cp", `missing file operand\n${TRY_HELP}`],
    ["cp a.txt", `missing destination file operand after 'a.txt'\n${TRY_HELP}`],
    ["cp -t dir", `missing file operand\n${TRY_HELP}`],
    ["cp -T a b c", `extra operand 'c'\n${TRY_HELP}`],
    ["cp -T -t dir a", "cannot combine --target-directory (-t) and --no-target-directory (-T)\n"],
    ["cp -t missing a.txt", "target directory 'missing': No such file or directory\n"],
    ["cp -t a.txt b.txt", "target directory 'a.txt': Not a directory\n"],
    ["cp -t dir -t dir a.txt", "multiple target directories specified\n"],
  ])("%s is an error", (input, message) => {
    const result = run(input);
    expect(result.events).toEqual([stderr(`cp: ${message}`)]);
    expect(result.session.exitStatus).toBe(1);
  });
});

describe("cp -f", () => {
  test.each(["-f", "--force"])("%s removes a destination it cannot open", (option) => {
    const result = run(`cp ${option} -v a.txt locked.txt`);
    expect(result.events).toEqual([stdout("'a.txt' -> 'locked.txt'\nremoved 'locked.txt'\n")]);
    expect(nodeAt(result.world, "/home/alice/locked.txt")).toMatchObject({
      content: "alpha\n",
      mode: 0o640,
    });
  });

  test("still fails when the destination cannot be removed", () => {
    expect(run("cp -f a.txt ro/in.txt").events).toEqual([
      stderr("cp: cannot remove 'ro/in.txt': Permission denied\n"),
    ]);
  });
});

describe("cp -r", () => {
  test("copies a directory with everything in it", () => {
    const result = run("cp -r tree new");
    expect(result.events).toEqual([]);
    expect(result.session.exitStatus).toBe(0);
    expect(contentOf(result.world, "/home/alice/new/top.txt")).toBe("top\n");
    expect(contentOf(result.world, "/home/alice/new/sub/deep.txt")).toBe("deep\n");
    expect(nodeAt(result.world, "/home/alice/new")).toMatchObject({ mode: 0o755, owner: 1000 });
  });

  test.each(["-R", "--recursive"])("%s is the same", (option) => {
    expect(contentOf(run(`cp ${option} tree new`).world, "/home/alice/new/top.txt")).toBe("top\n");
  });

  test("copies into an existing directory under the last component", () => {
    const result = run("cp -r tree/ dir");
    expect(contentOf(result.world, "/home/alice/dir/tree/sub/deep.txt")).toBe("deep\n");
  });

  test("merges into an existing directory with -T", () => {
    const result = run("cp -rT tree copy");
    expect(contentOf(result.world, "/home/alice/copy/top.txt")).toBe("top\n");
    expect(contentOf(result.world, "/home/alice/copy/sub/deep.txt")).toBe("deep\n");
  });

  test("@differential -v names the directories and files in the order of the directory", () => {
    expect(run("cp -rv tree new").events).toEqual([
      stdout(
        "'tree' -> 'new'\n" +
          "'tree/top.txt' -> 'new/top.txt'\n" +
          "'tree/sub' -> 'new/sub'\n" +
          "'tree/sub/deep.txt' -> 'new/sub/deep.txt'\n",
      ),
    ]);
  });

  test("keeps group write of the source unless the umask removes it", () => {
    expect(nodeAt(run("cp -r shared s2").world, "/home/alice/s2")?.mode).toBe(0o775);
    const asRoot = run("cp -r /home/alice/shared /home/alice/s3", root).world;
    expect(nodeAt(asRoot, "/home/alice/s3")).toMatchObject({ mode: 0o755, owner: 0 });
  });

  test("fills a directory whose source has no write bit, then gives it the source's bits", () => {
    const result = run("cp -r sealed s2");
    expect(result.session.exitStatus).toBe(0);
    expect(nodeAt(result.world, "/home/alice/s2")?.mode).toBe(0o500);
    expect(contentOf(result.world, "/home/alice/s2/in.txt")).toBe("in\n");
  });

  test("creates the directory before it finds that the source cannot be read", () => {
    const result = run("cp -r closed c2");
    expect(result.events).toEqual([stderr("cp: cannot access 'closed': Permission denied\n")]);
    expect(result.session.exitStatus).toBe(1);
    expect(nodeAt(result.world, "/home/alice/c2")?.kind).toBe("directory");
  });

  test("refuses to replace a file with a directory", () => {
    expect(run("cp -r tree a.txt").events).toEqual([
      stderr("cp: cannot overwrite non-directory 'a.txt' with directory 'tree'\n"),
    ]);
  });

  test("cannot create the directory in a directory without write permission", () => {
    expect(run("cp -r tree ro").events).toEqual([
      stderr("cp: cannot create directory 'ro/tree': Permission denied\n"),
    ]);
  });

  test("stops when it copies a directory into itself, after the entries before", () => {
    const result = run("cp -r tree tree/inner");
    expect(result.events).toEqual([
      stderr("cp: cannot copy a directory, 'tree', into itself, 'tree/inner'\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
    expect(contentOf(result.world, "/home/alice/tree/inner/top.txt")).toBe("top\n");
    expect(contentOf(result.world, "/home/alice/tree/inner/sub/deep.txt")).toBe("deep\n");
    expect(nodeAt(result.world, "/home/alice/tree/inner/inner")).toBeUndefined();
  });

  test("copying a directory into itself also happens with the directory as target", () => {
    expect(run("cp -r tree tree").events).toEqual([
      stderr("cp: cannot copy a directory, 'tree', into itself, 'tree/tree'\n"),
    ]);
  });

  test("a directory named twice is copied once, with a warning", () => {
    const result = run("cp -r tree tree dir");
    expect(result.events).toEqual([
      stderr("cp: warning: source directory 'tree' specified more than once\n"),
    ]);
    expect(result.session.exitStatus).toBe(0);
  });

  test("will not copy a directory again that an earlier operand copied", () => {
    const result = run("cp -r tree/sub tree dir");
    expect(result.events).toEqual([
      stderr("cp: will not create hard link 'dir/tree/sub' to directory 'dir/sub'\n"),
    ]);
    expect(result.session.exitStatus).toBe(1);
    expect(contentOf(result.world, "/home/alice/dir/tree/top.txt")).toBe("top\n");
  });
});

describe("cp: options that give a notice", () => {
  test.each([
    ["cp -p a.txt n", "-p"],
    ["cp -a tree n", "-a"],
    ["cp -i a.txt b.txt", "-i"],
    ["cp -n a.txt b.txt", "-n"],
    ["cp -u a.txt b.txt", "-u"],
    ["cp --parents a.txt dir", "--parents"],
    ["cp -l a.txt n", "-l"],
    ["cp -s a.txt n", "-s"],
    ["cp --backup a.txt b.txt", "--backup"],
    ["cp --preserve=mode a.txt n", "--preserve"],
    ["cp --help", "--help"],
  ])("%s", (input, option) => {
    expect(run(input).events).toEqual([
      { kind: "notice", command: "cp", notice: { key: "option-not-simulated", option } },
    ]);
  });
});

describe("file names", () => {
  test.each([
    ["a", "a"],
    ["a/b", "b"],
    ["a/b/", "b/"],
    ["/", ""],
    ["//a//", "a//"],
    ["", ""],
  ])("lastComponent(%j) is %j", (name, last) => {
    expect(lastComponent(name)).toBe(last);
  });

  test.each([
    ["a//", "a"],
    ["///", "/"],
    ["/", "/"],
    ["a", "a"],
  ])("stripTrailingSlashes(%j) is %j", (name, stripped) => {
    expect(stripTrailingSlashes(name)).toBe(stripped);
  });

  test.each([
    ["d", "f", "d/f"],
    ["d/", "f", "d/f"],
    ["d//", "f", "d/f"],
    ["/", "f", "/f"],
    ["//", "f", "//f"],
    ["", "f", "f"],
    ["d", "/f", "d/f"],
  ])("fileNameConcat(%j, %j) is %j", (directory, base, joined) => {
    expect(fileNameConcat(directory, base)).toBe(joined);
  });

  test.each([
    ["d", "a/b.txt", "d/b.txt"],
    ["d", "tree/", "d/tree"],
    ["d", "tree/..", "d/."],
    ["d/", "/", "d/"],
  ])("nameInDirectory(%j, %j) is %j", (target, arg, name) => {
    expect(nameInDirectory(target, arg)).toBe(name);
  });
});
