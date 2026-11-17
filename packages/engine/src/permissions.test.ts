import { describe, expect, test } from "vitest";

import type { Credentials } from "./credentials";
import type { DirectoryNode, FileNode } from "./fs-node";
import { toGid, toUid } from "./ids";
import { type Access, hasPermission } from "./permissions";

const root: Credentials = { uid: toUid(0), gid: toGid(0), groups: [toGid(0)] };
/** alice: primary group alice (1000), supplementary group it (50). */
const alice: Credentials = { uid: toUid(1000), gid: toGid(1000), groups: [toGid(1000), toGid(50)] };
const bob: Credentials = { uid: toUid(1001), gid: toGid(1001), groups: [toGid(1001)] };

function file(mode: number, owner = 1000, group = 1000): FileNode {
  return { kind: "file", owner: toUid(owner), group: toGid(group), mode, mtime: 0, content: "" };
}

function directory(mode: number, owner = 1000, group = 1000): DirectoryNode {
  return {
    kind: "directory",
    owner: toUid(owner),
    group: toGid(group),
    mode,
    mtime: 0,
    entries: new Map(),
  };
}

const ALL: readonly Access[] = ["read", "write", "execute"];

function allowed(node: FileNode | DirectoryNode, credentials: Credentials): Access[] {
  return ALL.filter((access) => hasPermission(node, credentials, access));
}

describe("hasPermission", () => {
  test("uses the owner bits for the owner", () => {
    expect(allowed(file(0o700), alice)).toEqual(["read", "write", "execute"]);
    expect(allowed(file(0o400), alice)).toEqual(["read"]);
    expect(allowed(file(0o200), alice)).toEqual(["write"]);
    expect(allowed(file(0o100), alice)).toEqual(["execute"]);
  });

  test("uses only the owner bits for the owner, even if group or other bits allow more", () => {
    expect(allowed(file(0o077), alice)).toEqual([]);
  });

  test("uses the group bits for a member of the primary group", () => {
    const sharedWithAlice = file(0o640, 1001, 1000);
    expect(allowed(sharedWithAlice, alice)).toEqual(["read"]);
  });

  test("uses the group bits for a member of a supplementary group", () => {
    const itFile = file(0o660, 0, 50);
    expect(allowed(itFile, alice)).toEqual(["read", "write"]);
    expect(allowed(itFile, bob)).toEqual([]);
  });

  test("uses only the group bits for a group member, even if the other bits allow more", () => {
    expect(allowed(file(0o607, 0, 50), alice)).toEqual([]);
  });

  test("uses the other bits for everybody else", () => {
    expect(allowed(file(0o644), bob)).toEqual(["read"]);
    expect(allowed(file(0o755), bob)).toEqual(["read", "execute"]);
    expect(allowed(file(0o602), bob)).toEqual(["write"]);
  });

  test("treats execute on a directory as search permission with the same bits", () => {
    expect(allowed(directory(0o711), bob)).toEqual(["execute"]);
    expect(allowed(directory(0o744), bob)).toEqual(["read"]);
  });

  test("ignores the setuid, setgid and sticky bits", () => {
    expect(allowed(file(0o7000), bob)).toEqual([]);
    expect(allowed(directory(0o1777, 0, 0), bob)).toEqual(["read", "write", "execute"]);
  });

  test("lets root read and write everything", () => {
    expect(allowed(file(0o000), root)).toEqual(["read", "write"]);
  });

  test("lets root run a file only if any execute bit is set", () => {
    expect(hasPermission(file(0o644), root, "execute")).toBe(false);
    expect(hasPermission(file(0o001), root, "execute")).toBe(true);
    expect(hasPermission(file(0o010), root, "execute")).toBe(true);
    expect(hasPermission(file(0o100), root, "execute")).toBe(true);
  });

  test("lets root search every directory", () => {
    expect(allowed(directory(0o000), root)).toEqual(["read", "write", "execute"]);
  });
});
