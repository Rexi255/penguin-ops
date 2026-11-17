import { describe, expect, test } from "vitest";

import type { Credentials } from "./credentials";
import type { DirectoryNode, FileNode, FsNode } from "./fs-node";
import { toGid, toUid } from "./ids";
import { lookup, nodeAtCanonicalPath } from "./lookup";

function file(content: string, mode = 0o644, owner = 0, group = 0): FileNode {
  return { kind: "file", owner: toUid(owner), group: toGid(group), mode, mtime: 0, content };
}

function dir(entries: Record<string, FsNode>, mode = 0o755, owner = 0, group = 0): DirectoryNode {
  return {
    kind: "directory",
    owner: toUid(owner),
    group: toGid(group),
    mode,
    mtime: 0,
    entries: new Map(Object.entries(entries)),
  };
}

const hostname = file("ws01\n");
const notes = file("buy fish\n", 0o600, 1000, 1000);
const readme = file("IT share\n");
const openDir = dir({ "todo.txt": file("feed penguins\n") });
const aliceHome = dir({ "notes.txt": notes }, 0o750, 1000, 1000);
const tilde = file("a file called ~\n");

/**
 * /etc            755 root:root
 * /home/alice     750 alice:alice
 * /home/bob       700 bob:bob
 * /srv/share      750 root:it      (it = 50; alice is a member, bob is not)
 * /srv/share/open 755 root:root
 * /locked         644 root:root    (readable, but not searchable)
 * /tmp            1777 root:root
 */
const root = dir({
  etc: dir({ hostname }),
  home: dir({
    alice: aliceHome,
    bob: dir({ "secret.txt": file("pin 1234\n", 0o600, 1001, 1001) }, 0o700, 1001, 1001),
  }),
  srv: dir({ share: dir({ readme, open: openDir }, 0o750, 0, 50) }),
  locked: dir({ inside: file("x\n") }, 0o644),
  tmp: dir({ "~": tilde }, 0o1777),
});

const rootUser: Credentials = { uid: toUid(0), gid: toGid(0), groups: [toGid(0)] };
const alice: Credentials = {
  uid: toUid(1000),
  gid: toGid(1000),
  groups: [toGid(1000), toGid(50)],
};
const bob: Credentials = { uid: toUid(1001), gid: toGid(1001), groups: [toGid(1001)] };

describe("lookup of absolute paths", () => {
  test("finds the root", () => {
    expect(lookup(root, alice, "/home/alice", "/")).toEqual({ ok: true, node: root, path: "/" });
  });

  test("finds a file and returns its canonical path", () => {
    expect(lookup(root, alice, "/", "/etc/hostname")).toEqual({
      ok: true,
      node: hostname,
      path: "/etc/hostname",
    });
  });

  test("ignores the working directory", () => {
    expect(lookup(root, alice, "/home/alice", "/etc/hostname")).toMatchObject({
      path: "/etc/hostname",
    });
  });

  test("treats repeated slashes like one", () => {
    expect(lookup(root, alice, "/", "//etc///hostname")).toMatchObject({ path: "/etc/hostname" });
  });

  test("resolves . and ..", () => {
    expect(lookup(root, alice, "/", "/etc/./../etc/hostname")).toMatchObject({
      path: "/etc/hostname",
    });
    expect(lookup(root, alice, "/", "/home/alice/..")).toMatchObject({ path: "/home" });
  });

  test("stays in the root for .. in the root", () => {
    expect(lookup(root, alice, "/", "/..")).toEqual({ ok: true, node: root, path: "/" });
    expect(lookup(root, alice, "/", "/../../etc")).toMatchObject({ path: "/etc" });
  });

  test("accepts a trailing slash after a directory", () => {
    expect(lookup(root, alice, "/", "/etc/")).toMatchObject({ ok: true, path: "/etc" });
  });

  test("treats a tilde as an ordinary name", () => {
    expect(lookup(root, alice, "/", "/tmp/~")).toEqual({ ok: true, node: tilde, path: "/tmp/~" });
    expect(lookup(root, alice, "/home/alice", "~")).toEqual({ ok: false, error: "ENOENT" });
  });
});

describe("lookup of relative paths", () => {
  test("starts in the working directory", () => {
    expect(lookup(root, alice, "/home/alice", "notes.txt")).toEqual({
      ok: true,
      node: notes,
      path: "/home/alice/notes.txt",
    });
  });

  test("resolves . to the working directory", () => {
    expect(lookup(root, alice, "/home/alice", ".")).toEqual({
      ok: true,
      node: aliceHome,
      path: "/home/alice",
    });
  });

  test("resolves .. from the working directory", () => {
    expect(lookup(root, alice, "/home/alice", "..")).toMatchObject({ path: "/home" });
    expect(lookup(root, alice, "/home/alice", "../../etc/hostname")).toMatchObject({
      node: hostname,
      path: "/etc/hostname",
    });
    expect(lookup(root, alice, "/home", "../../..")).toMatchObject({ path: "/" });
  });

  test("accepts a working directory with repeated slashes, . and ..", () => {
    expect(lookup(root, alice, "//etc/../home/./", "alice/notes.txt")).toMatchObject({
      path: "/home/alice/notes.txt",
    });
  });

  test("fails with ENOENT when the working directory does not exist any more", () => {
    expect(lookup(root, alice, "/home/carol", ".")).toEqual({ ok: false, error: "ENOENT" });
    expect(lookup(root, alice, "/home/carol", "../alice")).toEqual({
      ok: false,
      error: "ENOENT",
    });
  });

  test("fails with ENOENT when the working directory leads to a file", () => {
    expect(lookup(root, alice, "/etc/hostname", ".")).toEqual({ ok: false, error: "ENOENT" });
    expect(lookup(root, alice, "/etc/hostname/x", ".")).toEqual({ ok: false, error: "ENOENT" });
  });

  test("still resolves absolute paths when the working directory is gone", () => {
    expect(lookup(root, alice, "/home/carol", "/etc/hostname")).toMatchObject({ ok: true });
  });

  test("does not check the permissions on the way to the working directory again", () => {
    expect(lookup(root, bob, "/srv/share/open", "todo.txt")).toMatchObject({
      ok: true,
      path: "/srv/share/open/todo.txt",
    });
    expect(lookup(root, bob, "/srv/share/open", ".")).toMatchObject({ ok: true, node: openDir });
  });

  test("throws for a working directory that is not absolute", () => {
    expect(() => lookup(root, alice, "home/alice", "notes.txt")).toThrow(
      'the working directory must be an absolute path, got "home/alice"',
    );
  });
});

describe("lookup errors", () => {
  test("fails with ENOENT for a missing entry", () => {
    expect(lookup(root, alice, "/", "/missing")).toEqual({ ok: false, error: "ENOENT" });
    expect(lookup(root, alice, "/", "/etc/missing")).toEqual({ ok: false, error: "ENOENT" });
    expect(lookup(root, alice, "/etc", "missing")).toEqual({ ok: false, error: "ENOENT" });
  });

  test("fails with ENOENT for the empty path", () => {
    expect(lookup(root, alice, "/", "")).toEqual({ ok: false, error: "ENOENT" });
  });

  test("fails with ENOENT for .. after a missing entry", () => {
    expect(lookup(root, alice, "/", "/missing/..")).toEqual({ ok: false, error: "ENOENT" });
  });

  test("fails with ENOTDIR when a file is used as a directory", () => {
    expect(lookup(root, alice, "/", "/etc/hostname/x")).toEqual({ ok: false, error: "ENOTDIR" });
    expect(lookup(root, alice, "/", "/etc/hostname/.")).toEqual({ ok: false, error: "ENOTDIR" });
    expect(lookup(root, alice, "/", "/etc/hostname/..")).toEqual({ ok: false, error: "ENOTDIR" });
  });

  test("fails with ENOTDIR for a trailing slash after a file", () => {
    expect(lookup(root, alice, "/", "/etc/hostname/")).toEqual({ ok: false, error: "ENOTDIR" });
    expect(lookup(root, alice, "/etc", "hostname//")).toEqual({ ok: false, error: "ENOTDIR" });
  });

  test("fails with EACCES when a directory on the way may not be searched", () => {
    expect(lookup(root, bob, "/", "/home/alice/notes.txt")).toEqual({
      ok: false,
      error: "EACCES",
    });
  });

  test("reports EACCES before ENOENT for a missing entry in an unsearchable directory", () => {
    expect(lookup(root, bob, "/", "/home/alice/missing")).toEqual({ ok: false, error: "EACCES" });
  });

  test("needs no permission on the last component itself", () => {
    expect(lookup(root, bob, "/", "/home/alice")).toEqual({
      ok: true,
      node: aliceHome,
      path: "/home/alice",
    });
  });

  test("needs no search permission for a trailing slash", () => {
    expect(lookup(root, alice, "/", "/locked/")).toMatchObject({ ok: true, path: "/locked" });
  });

  test("needs search permission for . and .. inside a directory", () => {
    expect(lookup(root, alice, "/", "/locked/.")).toEqual({ ok: false, error: "EACCES" });
    expect(lookup(root, alice, "/", "/locked/..")).toEqual({ ok: false, error: "EACCES" });
    expect(lookup(root, alice, "/locked", ".")).toEqual({ ok: false, error: "EACCES" });
  });

  test("needs search permission on directories reached with .. from the working directory", () => {
    expect(lookup(root, bob, "/srv/share/open", "../readme")).toEqual({
      ok: false,
      error: "EACCES",
    });
  });

  test("allows searching through group permissions", () => {
    expect(lookup(root, alice, "/", "/srv/share/readme")).toMatchObject({ ok: true });
    expect(lookup(root, bob, "/", "/srv/share/readme")).toEqual({ ok: false, error: "EACCES" });
  });

  test("lets root search every directory", () => {
    expect(lookup(root, rootUser, "/", "/home/bob/secret.txt")).toMatchObject({ ok: true });
    expect(lookup(root, rootUser, "/", "/locked/inside")).toMatchObject({ ok: true });
  });

  test("reports the first failing component", () => {
    expect(lookup(root, bob, "/", "/etc/hostname/x/../../../home/alice/notes.txt")).toEqual({
      ok: false,
      error: "ENOTDIR",
    });
    expect(lookup(root, bob, "/", "/missing/hostname/")).toEqual({ ok: false, error: "ENOENT" });
  });
});

describe("nodeAtCanonicalPath", () => {
  test("returns the node without checking permissions", () => {
    expect(nodeAtCanonicalPath(root, [])).toBe(root);
    expect(nodeAtCanonicalPath(root, ["home", "bob", "secret.txt"])).toMatchObject({
      content: "pin 1234\n",
    });
    expect(nodeAtCanonicalPath(root, ["locked", "inside"])).toMatchObject({ content: "x\n" });
  });

  test("returns undefined for a missing name or a path through a file", () => {
    expect(nodeAtCanonicalPath(root, ["home", "carol"])).toBeUndefined();
    expect(nodeAtCanonicalPath(root, ["etc", "hostname", "x"])).toBeUndefined();
  });
});
