import { describe, expect, test } from "vitest";

import type { DirectoryNode } from "./fs-node";
import { toGid, toUid } from "./ids";
import { expandTilde, joinAbsolute, splitPath } from "./path";
import type { Host } from "./world";

describe("splitPath", () => {
  test("splits an absolute path", () => {
    expect(splitPath("/etc/hostname")).toEqual({
      absolute: true,
      components: ["etc", "hostname"],
      trailingSlash: false,
    });
  });

  test("splits a relative path and keeps . and ..", () => {
    expect(splitPath("./docs/../notes.txt")).toEqual({
      absolute: false,
      components: [".", "docs", "..", "notes.txt"],
      trailingSlash: false,
    });
  });

  test("drops empty names from repeated slashes and remembers a trailing slash", () => {
    expect(splitPath("//etc///ssh//")).toEqual({
      absolute: true,
      components: ["etc", "ssh"],
      trailingSlash: true,
    });
  });

  test("splits the root and the empty path", () => {
    expect(splitPath("/")).toEqual({ absolute: true, components: [], trailingSlash: true });
    expect(splitPath("")).toEqual({ absolute: false, components: [], trailingSlash: false });
  });

  test("keeps a tilde as an ordinary name", () => {
    expect(splitPath("~/notes").components).toEqual(["~", "notes"]);
  });
});

describe("joinAbsolute", () => {
  test("joins components to an absolute path", () => {
    expect(joinAbsolute(["home", "alice"])).toBe("/home/alice");
  });

  test("gives the root for no components", () => {
    expect(joinAbsolute([])).toBe("/");
  });
});

const emptyRoot: DirectoryNode = {
  kind: "directory",
  owner: toUid(0),
  group: toGid(0),
  mode: 0o755,
  mtime: 0,
  entries: new Map(),
};

const host: Host = {
  name: "ws01",
  root: emptyRoot,
  users: [
    { name: "root", uid: toUid(0), gid: toGid(0), home: "/root", shell: "/bin/bash" },
    { name: "alice", uid: toUid(1000), gid: toGid(0), home: "/home/alice", shell: "/bin/bash" },
    { name: "backup", uid: toUid(34), gid: toGid(0), home: "/var/backups", shell: "/bin/sh" },
  ],
  groups: [{ name: "root", gid: toGid(0), members: [] }],
};

describe("expandTilde", () => {
  test("replaces a lone tilde with the home directory", () => {
    expect(expandTilde("~", host, "/home/alice")).toBe("/home/alice");
  });

  test("replaces a leading ~/ with the home directory", () => {
    expect(expandTilde("~/docs/notes.txt", host, "/home/alice")).toBe("/home/alice/docs/notes.txt");
  });

  test("uses the given home, not the one of the user list", () => {
    expect(expandTilde("~/x", host, "/tmp/elsewhere")).toBe("/tmp/elsewhere/x");
  });

  test("replaces ~name with the home directory of that user", () => {
    expect(expandTilde("~backup", host, "/home/alice")).toBe("/var/backups");
    expect(expandTilde("~root/.bashrc", host, "/home/alice")).toBe("/root/.bashrc");
  });

  test("keeps ~name unchanged for an unknown user", () => {
    expect(expandTilde("~carol", host, "/home/alice")).toBe("~carol");
    expect(expandTilde("~carol/x", host, "/home/alice")).toBe("~carol/x");
  });

  test("keeps words without a leading tilde unchanged", () => {
    expect(expandTilde("notes~", host, "/home/alice")).toBe("notes~");
    expect(expandTilde("/tmp/~", host, "/home/alice")).toBe("/tmp/~");
    expect(expandTilde("", host, "/home/alice")).toBe("");
  });

  test("@differential joins the home / and the rest without removing the double slash", () => {
    expect(expandTilde("~/x", host, "/")).toBe("//x");
  });
});
