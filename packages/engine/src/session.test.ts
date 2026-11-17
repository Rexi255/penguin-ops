import { describe, expect, test } from "vitest";

import type { DirectoryNode } from "./fs-node";
import { toGid, toUid } from "./ids";
import { createSession, type Session, userAtHost } from "./session";
import { createWorld, type Host, type World } from "./world";

const emptyRoot: DirectoryNode = {
  kind: "directory",
  owner: toUid(0),
  group: toGid(0),
  mode: 0o755,
  mtime: 0,
  entries: new Map(),
};

function host(name: string): Host {
  return {
    name,
    root: emptyRoot,
    users: [
      { name: "root", uid: toUid(0), gid: toGid(0), home: "/root", shell: "/bin/bash" },
      {
        name: "alice",
        uid: toUid(1000),
        gid: toGid(1000),
        home: "/home/alice",
        shell: "/bin/bash",
      },
    ],
    groups: [
      { name: "root", gid: toGid(0), members: [] },
      { name: "sudo", gid: toGid(27), members: ["alice"] },
      { name: "alice", gid: toGid(1000), members: [] },
    ],
  };
}

const world = createWorld({ hosts: [host("ws01"), host("srv01")] });

describe("createSession", () => {
  test("starts in the user's home with the user's IDs and groups", () => {
    expect(createSession(world, "ws01", "alice")).toEqual({
      host: "ws01",
      credentials: { uid: 1000, gid: 1000, groups: [1000, 27] },
      cwd: "/home/alice",
    });
  });

  test("works on every host of the world", () => {
    const session = createSession(world, "srv01", "root");
    expect(session.host).toBe("srv01");
    expect(session.cwd).toBe("/root");
  });

  test("throws for an unknown host", () => {
    expect(() => createSession(world, "nas01", "alice")).toThrow(
      'cannot start a session: no host "nas01"',
    );
  });

  test("throws for an unknown user", () => {
    expect(() => createSession(world, "ws01", "carol")).toThrow(
      'cannot start a session: no user "carol" on host "ws01"',
    );
  });

  test("keeps the groups of the login when the group list changes later", () => {
    const session = createSession(world, "ws01", "alice");
    const original = host("ws01");
    const changed = createWorld({
      hosts: [{ ...original, groups: original.groups.map((g) => ({ ...g, members: [] })) }],
    });
    expect(session.credentials.groups).toEqual([1000, 27]);
    expect(createSession(changed, "ws01", "alice").credentials.groups).toEqual([1000]);
  });
});

describe("userAtHost", () => {
  test("shows user and host like bash's \\u@\\h", () => {
    expect(userAtHost(world, createSession(world, "srv01", "alice"))).toBe("alice@srv01");
  });

  test("@differential shows bash's placeholder when the UID has no user any more", () => {
    const session = createSession(world, "ws01", "alice");
    const original = host("ws01");
    const withoutAlice: World = createWorld({
      hosts: [
        {
          ...original,
          users: original.users.filter((u) => u.name !== "alice"),
          groups: original.groups.map((g) => ({ ...g, members: [] })),
        },
      ],
    });
    expect(userAtHost(withoutAlice, session)).toBe("I have no name!@ws01");
  });

  test("throws when the session's host is not part of the world", () => {
    const session: Session = { ...createSession(world, "ws01", "alice"), host: "gone" };
    expect(() => userAtHost(world, session)).toThrow(
      `the session's host "gone" is not part of the world`,
    );
  });
});
