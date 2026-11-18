import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import type { FsNode } from "./fs-node";
import { renameEntry, type RenameResult } from "./fs-rename";
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
          "/home/alice/a.txt": "a\n",
          "/home/alice/b.txt": "b\n",
          "/home/alice/dir/inner.txt": "inner\n",
          "/home/alice/empty/": {},
          "/home/alice/other/": {},
          "/home/alice/fixed/": { mode: 0o555 },
          "/home/alice/fixed/in.txt": "in\n",
          "/home/alice/locked-dir/": { mode: 0o555 },
          "/home/alice/hidden/": { mode: 0o600 },
          "/tmp/": { mode: 0o1777 },
          "/tmp/bob.txt": { content: "", owner: "bob" },
          "/tmp/alice.txt": { content: "", owner: "alice" },
        },
      },
    ],
  },
  createGameClock(BUILT),
);

const clock = createGameClock(NOW);

function rename(user: string, from: string, to: string, noReplace = false): RenameResult {
  const session: Session = createSession(world, "ws01", user);
  return renameEntry(world, session, from, to, noReplace, clock);
}

function nodeAt(current: World, path: string): FsNode | undefined {
  const root = findHost(current, "ws01")?.root;
  if (root === undefined) {
    throw new Error("no host ws01");
  }
  const found = lookup(root, createSession(world, "ws01", "root").credentials, "/", path);
  return found.ok ? found.node : undefined;
}

function renamed(result: RenameResult): World {
  if (!result.ok) {
    throw new Error(`the rename failed with ${result.error}`);
  }
  return result.world;
}

describe("renameEntry", () => {
  test("renames a file in its directory and keeps its node", () => {
    const after = renamed(rename("alice", "/home/alice/a.txt", "/home/alice/c.txt"));
    expect(nodeAt(after, "/home/alice/a.txt")).toBeUndefined();
    expect(nodeAt(after, "/home/alice/c.txt")).toBe(nodeAt(world, "/home/alice/a.txt"));
    expect(nodeAt(after, "/home/alice")?.mtime).toBe(NOW);
  });

  test("moves a directory to another directory and sets the mtimes of both", () => {
    const after = renamed(rename("alice", "/home/alice/dir", "/home/alice/other/moved"));
    expect(nodeAt(after, "/home/alice/other/moved/inner.txt")).toMatchObject({
      content: "inner\n",
    });
    expect(nodeAt(after, "/home/alice/dir")).toBeUndefined();
    expect(nodeAt(after, "/home/alice")?.mtime).toBe(NOW);
    expect(nodeAt(after, "/home/alice/other")?.mtime).toBe(NOW);
    expect(nodeAt(after, "/home/alice/other/moved")?.mtime).toBe(BUILT);
  });

  test("replaces a file, and an empty directory", () => {
    const files = renamed(rename("alice", "/home/alice/a.txt", "/home/alice/b.txt"));
    expect(nodeAt(files, "/home/alice/b.txt")).toMatchObject({ content: "a\n" });
    const directories = renamed(rename("alice", "/home/alice/dir", "/home/alice/empty"));
    expect(nodeAt(directories, "/home/alice/empty/inner.txt")).toBeDefined();
  });

  test("changes nothing for an entry renamed to itself", () => {
    expect(rename("alice", "/home/alice/a.txt", "/home/alice/./a.txt")).toEqual({
      ok: true,
      world,
    });
  });

  test("allows trailing slashes on a directory", () => {
    expect(rename("alice", "/home/alice/dir/", "/home/alice/new/")).toMatchObject({ ok: true });
  });

  test.each([
    ["/home/alice/missing", "/home/alice/x", false, "ENOENT"],
    ["/home/alice/a.txt", "/home/alice/missing/x", false, "ENOENT"],
    ["/home/alice/a.txt/x", "/home/alice/x", false, "ENOTDIR"],
    ["/home/alice/a.txt", "/home/alice/b.txt", true, "EEXIST"],
    ["/home/alice/a.txt", "/home/alice/x/", false, "ENOTDIR"],
    ["/home/alice/a.txt/", "/home/alice/x", false, "ENOTDIR"],
    ["/home/alice/.", "/home/alice/x", false, "EBUSY"],
    ["/home/alice/a.txt", "/home/alice/..", false, "EBUSY"],
    ["/home/alice/a.txt", "/home/alice/..", true, "EEXIST"],
    ["/home/alice/dir", "/home/alice/dir/sub", false, "EINVAL"],
    ["/home/alice/dir", "/home/alice/dir", true, "EEXIST"],
    ["/home/alice/dir/inner.txt", "/home/alice", false, "ENOTEMPTY"],
    ["/home/alice/empty", "/home/alice/dir", false, "ENOTEMPTY"],
    ["/home/alice/fixed/in.txt", "/home/alice/x", false, "EACCES"],
    ["/home/alice/a.txt", "/home/alice/fixed/x", false, "EACCES"],
    ["/home/alice/a.txt", "/home/alice/hidden/x", false, "EACCES"],
    ["/home/alice/locked-dir", "/home/alice/other/x", false, "EACCES"],
    ["/home/alice/dir", "/home/alice/a.txt", false, "ENOTDIR"],
    ["/home/alice/a.txt", "/home/alice/empty", false, "EISDIR"],
    ["/tmp/bob.txt", "/tmp/x", false, "EPERM"],
    ["/tmp/alice.txt", "/tmp/bob.txt", false, "EPERM"],
  ])("%s -> %s (noReplace %s) fails with %s", (from, to, noReplace, error) => {
    expect(rename("alice", from, to, noReplace)).toEqual({ ok: false, error });
  });

  test("lets a directory without write permission move within its directory", () => {
    expect(rename("alice", "/home/alice/locked-dir", "/home/alice/renamed")).toMatchObject({
      ok: true,
    });
  });

  test("lets root rename everything", () => {
    expect(rename("root", "/tmp/bob.txt", "/tmp/x")).toMatchObject({ ok: true });
  });
});
