import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import type { FsNode } from "./fs-node";
import {
  changeMode,
  type FileWrite,
  makeDirectory,
  type MakeDirectoryResult,
  setTimes,
  type SetTimesResult,
  type TimesUpdate,
  writeFile,
  type WriteMode,
  type WriteResult,
  writeToOpenFile,
} from "./fs-write";
import { lookup } from "./lookup";
import { createSession, type Session } from "./session";
import { findHost, type World } from "./world";
import { buildWorld } from "./world-builder";

/** The time the world was built at, and the time of the writes. */
const BUILT = 1_000;
const NOW = 5_000;

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [
          { name: "root", gid: 0 },
          { name: "users", gid: 100 },
          { name: "alice", gid: 1000 },
          { name: "bob", gid: 1001 },
          { name: "devs", gid: 2000, members: ["alice", "bob"] },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "alice", uid: 1000 },
          { name: "bob", uid: 1001 },
          { name: "carol", uid: 1002, group: "users" },
        ],
        files: {
          "/etc/hostname": "ws01\n",
          "/home/alice/notes.txt": "hello\n",
          "/home/alice/locked.txt": { content: "secret\n", mode: 0o444 },
          "/home/alice/docs/": {},
          "/home/alice/private/": { mode: 0o600 },
          "/home/carol/": {},
          "/srv/shared/": { group: "devs", mode: 0o2775 },
          "/srv/closed/": { mode: 0o700 },
          "/srv/readonly/": { mode: 0o555 },
          "/srv/readonly/open.txt": { content: "open\n", mode: 0o666 },
        },
      },
      { name: "srv01", groups: [{ name: "root", gid: 0 }], users: [{ name: "root", uid: 0 }] },
    ],
  },
  createGameClock(BUILT),
);

const clock = createGameClock(NOW);

function session(user: string, cwd?: string): Session {
  const started = createSession(world, "ws01", user);
  return cwd === undefined ? started : { ...started, cwd };
}

function write(
  user: string,
  path: string,
  text: string,
  mode: WriteMode = "truncate",
  cwd?: string,
): WriteResult {
  const request: FileWrite = { path, text, mode };
  return writeFile(world, session(user, cwd), request, clock);
}

/** Returns the changed world of a successful write, or fails the test. */
function changed(result: WriteResult): World {
  if (!result.ok) {
    throw new Error(`the write failed with ${result.error}`);
  }
  return result.world;
}

/** Returns the node at the absolute `path` of ws01 in `world`, looked up as root. */
function nodeAt(world: World, path: string): FsNode | undefined {
  const root = findHost(world, "ws01")?.root;
  if (root === undefined) {
    throw new Error("no host ws01");
  }
  const result = lookup(root, session("root").credentials, "/", path);
  return result.ok ? result.node : undefined;
}

describe("writeFile creates a missing file", () => {
  test("@differential with the user, the primary group, the mode 0o666 & ~umask and the time", () => {
    const after = changed(write("alice", "/home/alice/todo.txt", "buy milk\n"));
    expect(nodeAt(after, "/home/alice/todo.txt")).toEqual({
      kind: "file",
      owner: 1000,
      group: 1000,
      mode: 0o664,
      mtime: NOW,
      content: "buy milk\n",
    });
  });

  test("@differential with the mode 0o644 for root and for a user without a private group", () => {
    const asRoot = changed(write("root", "/srv/root.txt", ""));
    expect(nodeAt(asRoot, "/srv/root.txt")).toMatchObject({ owner: 0, group: 0, mode: 0o644 });
    const asCarol = changed(write("carol", "/home/carol/carol.txt", ""));
    expect(nodeAt(asCarol, "/home/carol/carol.txt")).toMatchObject({
      owner: 1002,
      group: 100,
      mode: 0o644,
    });
  });

  test("with the mode the session's umask leaves", () => {
    const strict: Session = { ...session("alice"), umask: 0o077 };
    const after = changed(
      writeFile(world, strict, { path: "todo.txt", text: "", mode: "truncate" }, clock),
    );
    expect(nodeAt(after, "/home/alice/todo.txt")).toMatchObject({ mode: 0o600 });
  });

  test("and sets the mtime of its directory, but not of the directories above", () => {
    const after = changed(write("alice", "/home/alice/todo.txt", ""));
    expect(nodeAt(after, "/home/alice")?.mtime).toBe(NOW);
    expect(nodeAt(after, "/home")?.mtime).toBe(BUILT);
    expect(nodeAt(after, "/")?.mtime).toBe(BUILT);
  });

  test("with the group of a setgid directory instead of the user's primary group", () => {
    const after = changed(write("alice", "/srv/shared/plan.txt", "plan\n"));
    expect(nodeAt(after, "/srv/shared/plan.txt")).toMatchObject({ owner: 1000, group: 2000 });
  });

  test("also when it appends", () => {
    const after = changed(write("alice", "/home/alice/log.txt", "first\n", "append"));
    expect(nodeAt(after, "/home/alice/log.txt")).toMatchObject({ content: "first\n", mtime: NOW });
  });

  test("also with the empty text", () => {
    const after = changed(write("alice", "/home/alice/empty.txt", "", "append"));
    expect(nodeAt(after, "/home/alice/empty.txt")).toMatchObject({ content: "", mtime: NOW });
  });

  test("after the entries that are already in the directory", () => {
    const after = changed(write("alice", "/home/alice/a.txt", ""));
    const home = nodeAt(after, "/home/alice");
    expect(home?.kind === "directory" ? [...home.entries.keys()] : []).toEqual([
      "notes.txt",
      "locked.txt",
      "docs",
      "private",
      "a.txt",
    ]);
  });
});

describe("writeFile writes to an existing file", () => {
  test("replaces the content with truncate and keeps owner, group and mode", () => {
    const after = changed(write("alice", "/home/alice/notes.txt", "new\n"));
    expect(nodeAt(after, "/home/alice/notes.txt")).toEqual({
      kind: "file",
      owner: 1000,
      group: 1000,
      mode: 0o644,
      mtime: NOW,
      content: "new\n",
    });
  });

  test("empties the file and sets the mtime when it truncates with the empty text", () => {
    const after = changed(write("alice", "/home/alice/notes.txt", ""));
    expect(nodeAt(after, "/home/alice/notes.txt")).toMatchObject({ content: "", mtime: NOW });
  });

  test("adds the text to the end with append", () => {
    const after = changed(write("alice", "/home/alice/notes.txt", "world\n", "append"));
    expect(nodeAt(after, "/home/alice/notes.txt")).toMatchObject({
      content: "hello\nworld\n",
      mtime: NOW,
    });
  });

  test("@differential changes nothing when it appends the empty text", () => {
    const result = write("alice", "/home/alice/notes.txt", "", "append");
    expect(result).toEqual({ ok: true, world, path: "/home/alice/notes.txt" });
    expect(changed(result)).toBe(world);
  });

  test("keeps the mtime of the directory", () => {
    const after = changed(write("alice", "/home/alice/notes.txt", "new\n"));
    expect(nodeAt(after, "/home/alice")?.mtime).toBe(BUILT);
  });

  test("in a directory that the user may search but not write", () => {
    const after = changed(write("alice", "/srv/readonly/open.txt", "changed\n"));
    expect(nodeAt(after, "/srv/readonly/open.txt")).toMatchObject({ content: "changed\n" });
  });

  test("as root, even without write permission on the file or the directory", () => {
    const after = changed(write("root", "/home/alice/locked.txt", "root was here\n"));
    expect(nodeAt(after, "/home/alice/locked.txt")).toMatchObject({
      content: "root was here\n",
      owner: 1000,
      mode: 0o444,
    });
    const created = changed(write("root", "/srv/readonly/new.txt", ""));
    expect(nodeAt(created, "/srv/readonly/new.txt")).toBeDefined();
  });
});

describe("writeFile resolves paths", () => {
  test("relative to the working directory", () => {
    const after = changed(write("alice", "docs/readme.txt", "hi\n", "truncate", "/home/alice"));
    expect(nodeAt(after, "/home/alice/docs/readme.txt")).toMatchObject({ content: "hi\n" });
  });

  test("with a plain name in the working directory", () => {
    const after = changed(write("alice", "readme.txt", "hi\n", "truncate", "/home/alice/docs"));
    expect(nodeAt(after, "/home/alice/docs/readme.txt")).toMatchObject({ content: "hi\n" });
  });

  test("with ., .. and repeated slashes on the way", () => {
    const after = changed(
      write("alice", "./docs/..//docs/./a.txt", "a\n", "truncate", "/home/alice"),
    );
    expect(nodeAt(after, "/home/alice/docs/a.txt")).toMatchObject({ content: "a\n" });
  });

  test("and returns the canonical absolute path of the file", () => {
    const relative = write("alice", "./docs/..//docs/./a.txt", "a\n", "truncate", "/home/alice");
    expect(relative).toMatchObject({ ok: true, path: "/home/alice/docs/a.txt" });
    const existing = write("alice", "../alice/notes.txt", "", "append", "/home/alice");
    expect(existing).toMatchObject({ ok: true, path: "/home/alice/notes.txt" });
  });
});

describe("writeFile keeps the old world", () => {
  test("unchanged", () => {
    changed(write("alice", "/home/alice/notes.txt", "new\n"));
    changed(write("alice", "/home/alice/todo.txt", "new\n"));
    expect(nodeAt(world, "/home/alice/notes.txt")).toMatchObject({ content: "hello\n" });
    expect(nodeAt(world, "/home/alice/todo.txt")).toBeUndefined();
    expect(nodeAt(world, "/home/alice")?.mtime).toBe(BUILT);
  });

  test("and shares the nodes and hosts the write does not touch", () => {
    const after = changed(write("alice", "/home/alice/notes.txt", "new\n"));
    expect(nodeAt(after, "/etc")).toBe(nodeAt(world, "/etc"));
    expect(nodeAt(after, "/home/alice/docs")).toBe(nodeAt(world, "/home/alice/docs"));
    expect(findHost(after, "srv01")).toBe(findHost(world, "srv01"));
    expect(findHost(after, "ws01")?.users).toBe(findHost(world, "ws01")?.users);
  });
});

describe("writeFile fails", () => {
  test("with ENOENT for the empty path", () => {
    expect(write("alice", "", "x")).toEqual({ ok: false, error: "ENOENT" });
  });

  test("with ENOENT when a directory on the way is missing", () => {
    expect(write("alice", "/home/alice/missing/a.txt", "x")).toEqual({
      ok: false,
      error: "ENOENT",
    });
  });

  test("with ENOENT for a relative path when the working directory is gone", () => {
    expect(write("alice", "a.txt", "x", "truncate", "/home/gone")).toEqual({
      ok: false,
      error: "ENOENT",
    });
  });

  test("with ENOTDIR when a file is on the way", () => {
    expect(write("alice", "/etc/hostname/a.txt", "x")).toEqual({ ok: false, error: "ENOTDIR" });
  });

  test("with EACCES when a directory on the way may not be searched", () => {
    expect(write("alice", "/srv/closed/sub/a.txt", "x")).toEqual({ ok: false, error: "EACCES" });
  });

  test("with EACCES when the file's directory may not be searched, even by its owner", () => {
    expect(write("alice", "/srv/closed/a.txt", "x")).toEqual({ ok: false, error: "EACCES" });
    expect(write("alice", "/home/alice/private/a.txt", "x")).toEqual({
      ok: false,
      error: "EACCES",
    });
  });

  test("with EACCES for a new file in a directory the user may not write", () => {
    expect(write("alice", "/srv/readonly/new.txt", "x")).toEqual({ ok: false, error: "EACCES" });
    expect(write("bob", "/home/alice/new.txt", "x")).toEqual({ ok: false, error: "EACCES" });
  });

  test("with EACCES for an existing file the user may not write", () => {
    expect(write("alice", "/etc/hostname", "x")).toEqual({ ok: false, error: "EACCES" });
    expect(write("bob", "/home/alice/notes.txt", "x", "append")).toEqual({
      ok: false,
      error: "EACCES",
    });
  });

  test("with EACCES for the owner of a file without the owner's write bit", () => {
    expect(write("alice", "/home/alice/locked.txt", "x")).toEqual({ ok: false, error: "EACCES" });
  });

  test("with EISDIR for an existing directory", () => {
    expect(write("alice", "/home/alice/docs", "x")).toEqual({ ok: false, error: "EISDIR" });
    expect(write("root", "/srv/closed", "x", "append")).toEqual({ ok: false, error: "EISDIR" });
  });

  test("with EISDIR for /, . and paths that end in . or ..", () => {
    expect(write("root", "/", "x")).toEqual({ ok: false, error: "EISDIR" });
    expect(write("alice", ".", "x", "truncate", "/home/alice")).toEqual({
      ok: false,
      error: "EISDIR",
    });
    expect(write("alice", "/home/alice/docs/..", "x")).toEqual({ ok: false, error: "EISDIR" });
  });

  test("with the lookup error for paths that end in . or .. but do not resolve", () => {
    expect(write("alice", "/etc/hostname/.", "x")).toEqual({ ok: false, error: "ENOTDIR" });
    expect(write("alice", "/srv/closed/.", "x")).toEqual({ ok: false, error: "EACCES" });
    expect(write("alice", "/home/alice/missing/..", "x")).toEqual({
      ok: false,
      error: "ENOENT",
    });
  });

  test("@differential with EISDIR for every path with a trailing slash", () => {
    expect(write("alice", "/home/alice/new/", "x")).toEqual({ ok: false, error: "EISDIR" });
    expect(write("alice", "/home/alice/notes.txt/", "x")).toEqual({ ok: false, error: "EISDIR" });
    expect(write("alice", "/home/alice/docs/", "x")).toEqual({ ok: false, error: "EISDIR" });
  });

  test("with the error of the way before EISDIR for a trailing slash", () => {
    expect(write("alice", "/srv/closed/new/", "x")).toEqual({ ok: false, error: "EACCES" });
    expect(write("alice", "/etc/hostname/new/", "x")).toEqual({ ok: false, error: "ENOTDIR" });
  });

  test("by throwing when the session's host is not part of the world", () => {
    const lost: Session = { ...session("alice"), host: "gone" };
    expect(() =>
      writeFile(world, lost, { path: "/tmp/a", text: "", mode: "truncate" }, clock),
    ).toThrow(`the session's host "gone" is not part of the world`);
  });
});

describe("writeToOpenFile", () => {
  test("adds the text to the end of the file and sets the mtime", () => {
    const after = writeToOpenFile(world, "ws01", "/home/alice/notes.txt", "more\n", clock);
    expect(nodeAt(after, "/home/alice/notes.txt")).toMatchObject({
      content: "hello\nmore\n",
      mtime: NOW,
    });
    expect(nodeAt(after, "/home/alice")?.mtime).toBe(BUILT);
  });

  test("does not check permissions, because the file is already open", () => {
    const after = writeToOpenFile(world, "ws01", "/home/alice/locked.txt", "more\n", clock);
    expect(nodeAt(after, "/home/alice/locked.txt")).toMatchObject({
      content: "secret\nmore\n",
      mode: 0o444,
    });
  });

  test("changes nothing for the empty text", () => {
    expect(writeToOpenFile(world, "ws01", "/home/alice/notes.txt", "", clock)).toBe(world);
  });

  test("loses the text if no file is at the path any more", () => {
    for (const path of [
      "/home/alice/gone.txt",
      "/home/alice/missing/a.txt",
      "/etc/hostname/a.txt",
      "/home/alice/docs",
      "/",
    ]) {
      expect(writeToOpenFile(world, "ws01", path, "x", clock)).toBe(world);
    }
  });

  test("by throwing when the host is not part of the world", () => {
    expect(() => writeToOpenFile(world, "gone", "/tmp/a", "x", clock)).toThrow(
      `the host "gone" is not part of the world`,
    );
  });
});

function mkdir(user: string, path: string, cwd?: string): MakeDirectoryResult {
  return makeDirectory(world, session(user, cwd), path, clock);
}

/** Returns the changed world of a successful mkdir, or fails the test. */
function made(result: MakeDirectoryResult): World {
  if (!result.ok) {
    throw new Error(`mkdir failed with ${result.error}`);
  }
  return result.world;
}

describe("makeDirectory", () => {
  test("@differential creates an empty directory with the user, group, 0o777 & ~umask and time", () => {
    const result = mkdir("alice", "/home/alice/new");
    expect(result).toMatchObject({ ok: true, path: "/home/alice/new" });
    expect(nodeAt(made(result), "/home/alice/new")).toEqual({
      kind: "directory",
      owner: 1000,
      group: 1000,
      mode: 0o775,
      mtime: NOW,
      entries: new Map(),
    });
  });

  test("sets the mtime of the parent, but not of the directories above", () => {
    const after = made(mkdir("alice", "/home/alice/new"));
    expect(nodeAt(after, "/home/alice")?.mtime).toBe(NOW);
    expect(nodeAt(after, "/home")?.mtime).toBe(BUILT);
  });

  test("resolves relative paths and allows a trailing slash", () => {
    const result = mkdir("alice", "docs//sub/", "/home/alice");
    expect(result).toMatchObject({ ok: true, path: "/home/alice/docs/sub" });
    expect(nodeAt(made(result), "/home/alice/docs/sub")?.kind).toBe("directory");
  });

  test("uses the session's umask", () => {
    const strict: Session = { ...session("alice"), umask: 0o077 };
    const after = made(makeDirectory(world, strict, "/home/alice/new", clock));
    expect(nodeAt(after, "/home/alice/new")?.mode).toBe(0o700);
  });

  test("inherits the group and the setgid bit of a setgid parent", () => {
    const after = made(mkdir("alice", "/srv/shared/team"));
    expect(nodeAt(after, "/srv/shared/team")).toMatchObject({
      owner: 1000,
      group: 2000,
      mode: 0o2775,
    });
  });

  test.each([
    ["/home/alice/docs"],
    ["/home/alice/notes.txt"],
    ["/home/alice/notes.txt/"],
    ["/"],
    ["/home/alice/."],
    ["/home/alice/docs/.."],
  ])("fails with EEXIST for %s", (path) => {
    expect(mkdir("alice", path)).toEqual({ ok: false, error: "EEXIST" });
  });

  test.each([
    ["", "ENOENT"],
    ["/home/alice/missing/new", "ENOENT"],
    ["/etc/hostname/new", "ENOTDIR"],
    ["/etc/hostname/.", "ENOTDIR"],
    ["/srv/closed/new", "EACCES"],
    ["/home/alice/private/new", "EACCES"],
    ["/srv/readonly/new", "EACCES"],
    ["/etc/new", "EACCES"],
  ])("fails for %j with %s", (path, error) => {
    expect(mkdir("alice", path)).toEqual({ ok: false, error });
  });

  test("lets root create directories everywhere", () => {
    expect(mkdir("root", "/srv/readonly/new")).toMatchObject({ ok: true });
  });

  test("by throwing when the session's host is not part of the world", () => {
    const lost: Session = { ...session("alice"), host: "gone" };
    expect(() => makeDirectory(world, lost, "/tmp/a", clock)).toThrow(
      `the session's host "gone" is not part of the world`,
    );
  });
});

function times(user: string, path: string, update: TimesUpdate): SetTimesResult {
  return setTimes(world, session(user), path, update, clock);
}

/** The mtime of `path` after a successful setTimes, or fails the test. */
function mtimeAfter(result: SetTimesResult, path: string): number | undefined {
  if (!result.ok) {
    throw new Error(`setTimes failed with ${result.error}`);
  }
  return nodeAt(result.world, path)?.mtime;
}

describe("setTimes", () => {
  test("sets the mtime of a file to the clock's time, without changing its directory", () => {
    const result = times("alice", "/home/alice/notes.txt", { kind: "now" });
    expect(mtimeAfter(result, "/home/alice/notes.txt")).toBe(NOW);
    expect(mtimeAfter(result, "/home/alice")).toBe(BUILT);
  });

  test("sets a given mtime, the clock's time, or none", () => {
    const path = "/home/alice/notes.txt";
    expect(mtimeAfter(times("alice", path, { kind: "explicit", mtime: 42 }), path)).toBe(42);
    expect(mtimeAfter(times("alice", path, { kind: "explicit", mtime: "now" }), path)).toBe(NOW);
    const omitted = times("alice", path, { kind: "explicit", mtime: "omit" });
    expect(omitted).toEqual({ ok: true, world });
  });

  test("works on directories and on the root", () => {
    expect(
      mtimeAfter(times("alice", "/home/alice/docs", { kind: "now" }), "/home/alice/docs"),
    ).toBe(NOW);
    expect(mtimeAfter(times("root", "/", { kind: "explicit", mtime: 7 }), "/")).toBe(7);
  });

  test("lets the owner set the time of a file without write permission", () => {
    const result = times("alice", "/home/alice/locked.txt", { kind: "now" });
    expect(mtimeAfter(result, "/home/alice/locked.txt")).toBe(NOW);
  });

  test("lets others with write permission set the current time, but no other time", () => {
    const path = "/srv/readonly/open.txt";
    expect(mtimeAfter(times("alice", path, { kind: "now" }), path)).toBe(NOW);
    expect(times("alice", path, { kind: "explicit", mtime: 42 })).toEqual({
      ok: false,
      error: "EPERM",
    });
    expect(times("alice", path, { kind: "explicit", mtime: "omit" })).toEqual({
      ok: false,
      error: "EPERM",
    });
  });

  test("fails with EACCES for others without write permission", () => {
    expect(times("bob", "/home/alice/notes.txt", { kind: "now" })).toEqual({
      ok: false,
      error: "EACCES",
    });
  });

  test("lets root set every time", () => {
    const path = "/home/alice/notes.txt";
    expect(mtimeAfter(times("root", path, { kind: "explicit", mtime: 42 }), path)).toBe(42);
  });

  test.each([
    ["/home/alice/missing", "ENOENT"],
    ["/home/alice/notes.txt/", "ENOTDIR"],
    ["/srv/closed/x", "EACCES"],
  ])("fails for %s with %s", (path, error) => {
    expect(times("alice", path, { kind: "now" })).toEqual({ ok: false, error });
  });
});

describe("writeFile and makeDirectory with a mode", () => {
  test("a new file gets the permission bits of createMode minus the umask", () => {
    const after = changed(
      writeFile(
        world,
        session("alice"),
        { path: "/home/alice/run.sh", text: "", mode: "truncate", createMode: 0o4755 },
        clock,
      ),
    );
    expect(nodeAt(after, "/home/alice/run.sh")?.mode).toBe(0o755);
  });

  test("an existing file keeps its mode", () => {
    const after = changed(
      writeFile(
        world,
        session("alice"),
        { path: "/home/alice/notes.txt", text: "x", mode: "truncate", createMode: 0o600 },
        clock,
      ),
    );
    expect(nodeAt(after, "/home/alice/notes.txt")?.mode).toBe(0o644);
  });

  test("a new directory keeps the sticky bit of its mode, but not setuid and setgid", () => {
    const after = made(makeDirectory(world, session("alice"), "/home/alice/t", clock, 0o7777));
    expect(nodeAt(after, "/home/alice/t")?.mode).toBe(0o1775);
  });
});

describe("changeMode", () => {
  test("sets the mode of the owner's node without changing its mtime", () => {
    const result = changeMode(world, session("alice"), "/home/alice/notes.txt", 0o600);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(nodeAt(result.world, "/home/alice/notes.txt")).toMatchObject({
        mode: 0o600,
        mtime: BUILT,
      });
    }
  });

  test("lets root change every mode", () => {
    expect(changeMode(world, session("root"), "/home/alice/docs", 0o700).ok).toBe(true);
    expect(changeMode(world, session("root"), "/", 0o755).ok).toBe(true);
  });

  test("fails with EPERM for other users and with lookup errors", () => {
    expect(changeMode(world, session("bob"), "/home/alice/notes.txt", 0o777)).toEqual({
      ok: false,
      error: "EPERM",
    });
    expect(changeMode(world, session("alice"), "/home/alice/missing", 0o777)).toEqual({
      ok: false,
      error: "ENOENT",
    });
  });

  test("throws for an invalid mode", () => {
    expect(() => changeMode(world, session("alice"), "/home/alice/notes.txt", 0o10000)).toThrow(
      RangeError,
    );
  });
});
