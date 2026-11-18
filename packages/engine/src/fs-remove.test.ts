import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import type { FsNode } from "./fs-node";
import { removeEntry, type RemovedKind, type RemoveResult } from "./fs-remove";
import { lookup } from "./lookup";
import { createSession, type Session } from "./session";
import { findHost, type World } from "./world";
import { buildWorld } from "./world-builder";

const BUILT = 1_000;
const NOW = 5_000;

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
          "/home/alice/notes.txt": "hello\n",
          "/home/alice/locked.txt": { content: "secret\n", mode: 0o444 },
          "/home/alice/empty/": {},
          "/home/alice/full/a.txt": "a\n",
          "/home/alice/readonly/": { mode: 0o555 },
          "/home/alice/readonly/inside.txt": "inside\n",
          "/home/alice/hidden/": { mode: 0o600 },
          "/tmp/": { mode: 0o1777 },
          "/tmp/alice.txt": { content: "", owner: "alice" },
          "/tmp/bob.txt": { content: "", owner: "bob" },
          "/tmp/bobdir/": { owner: "bob" },
          "/srv/bob/": { owner: "bob", mode: 0o1777 },
          "/srv/bob/alice.txt": { content: "", owner: "alice" },
          "/srv/bob/root.txt": "",
        },
      },
    ],
  },
  createGameClock(BUILT),
);

const clock = createGameClock(NOW);

function remove(user: string, path: string, kind: RemovedKind, cwd?: string): RemoveResult {
  const started = createSession(world, "ws01", user);
  const session: Session = cwd === undefined ? started : { ...started, cwd };
  return removeEntry(world, session, path, kind, clock);
}

function nodeAt(current: World, path: string): FsNode | undefined {
  const root = findHost(current, "ws01")?.root;
  if (root === undefined) {
    throw new Error("no host ws01");
  }
  const found = lookup(root, createSession(world, "ws01", "root").credentials, "/", path);
  return found.ok ? found.node : undefined;
}

function removed(result: RemoveResult): World {
  if (!result.ok) {
    throw new Error(`the removal failed with ${result.error}`);
  }
  return result.world;
}

describe("removeEntry: files", () => {
  test("removes a file and sets the mtime of its directory only", () => {
    const after = removed(remove("alice", "/home/alice/notes.txt", "file"));
    expect(nodeAt(after, "/home/alice/notes.txt")).toBeUndefined();
    expect(nodeAt(after, "/home/alice")?.mtime).toBe(NOW);
    expect(nodeAt(after, "/home")?.mtime).toBe(BUILT);
    expect(nodeAt(world, "/home/alice/notes.txt")).toBeDefined();
  });

  test("removes a write-protected file, because only the directory's permissions count", () => {
    const after = removed(remove("alice", "locked.txt", "file", "/home/alice"));
    expect(nodeAt(after, "/home/alice/locked.txt")).toBeUndefined();
  });

  test.each([
    ["/home/alice/missing.txt", "ENOENT"],
    ["/home/alice/notes.txt/x", "ENOTDIR"],
    ["/home/alice/notes.txt/", "ENOTDIR"],
    ["/home/alice/empty/", "EISDIR"],
    ["/home/alice/empty", "EISDIR"],
    ["/home/alice/readonly/inside.txt", "EACCES"],
    ["/home/alice/hidden/x", "EACCES"],
    ["/home/alice/.", "EISDIR"],
    ["/", "EISDIR"],
    ["", "ENOENT"],
  ])("fails for %j with %s", (path, error) => {
    expect(remove("alice", path, "file")).toEqual({ ok: false, error });
  });

  test("checks the permission before the kind of the entry", () => {
    expect(remove("bob", "/home/alice/empty", "file")).toEqual({ ok: false, error: "EACCES" });
  });
});

describe("removeEntry: directories", () => {
  test("removes an empty directory, also with a trailing slash", () => {
    const after = removed(remove("alice", "/home/alice/empty/", "directory"));
    expect(nodeAt(after, "/home/alice/empty")).toBeUndefined();
    expect(nodeAt(after, "/home/alice")?.mtime).toBe(NOW);
  });

  test.each([
    ["/home/alice/full", "ENOTEMPTY"],
    ["/home/alice/notes.txt", "ENOTDIR"],
    ["/home/alice/missing", "ENOENT"],
    ["/home/alice/empty/.", "EINVAL"],
    ["/home/alice/full/..", "ENOTEMPTY"],
    ["/", "EBUSY"],
    ["/home/alice/missing/..", "ENOENT"],
  ])("fails for %s with %s", (path, error) => {
    expect(remove("alice", path, "directory")).toEqual({ ok: false, error });
  });
});

describe("removeEntry: the sticky bit", () => {
  test("lets users remove their own entries", () => {
    expect(remove("alice", "/tmp/alice.txt", "file")).toMatchObject({ ok: true });
  });

  test("protects the entries of other users", () => {
    expect(remove("alice", "/tmp/bob.txt", "file")).toEqual({ ok: false, error: "EPERM" });
    expect(remove("alice", "/tmp/bobdir", "directory")).toEqual({ ok: false, error: "EPERM" });
  });

  test("lets the owner of the directory and root remove every entry", () => {
    expect(remove("bob", "/srv/bob/alice.txt", "file")).toMatchObject({ ok: true });
    expect(remove("bob", "/srv/bob/root.txt", "file")).toMatchObject({ ok: true });
    expect(remove("root", "/tmp/bob.txt", "file")).toMatchObject({ ok: true });
  });
});

test("removeEntry throws when the session's host is not part of the world", () => {
  const lost: Session = { ...createSession(world, "ws01", "alice"), host: "gone" };
  expect(() => removeEntry(world, lost, "/tmp/a", "file", clock)).toThrow(
    `the session's host "gone" is not part of the world`,
  );
});
