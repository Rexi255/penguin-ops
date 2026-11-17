import { describe, expect, test } from "vitest";

import type { DirectoryNode, FileNode, FsNode } from "./fs-node";
import { toGid, toUid } from "./ids";
import { createSession, type Session, userAtHost } from "./session";
import { createWorld, type Host, type User, type World } from "./world";

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

const profile: FileNode = {
  kind: "file",
  owner: toUid(1000),
  group: toGid(1000),
  mode: 0o644,
  mtime: 0,
  content: "",
};

/** `/root` (700 root) and `/home/alice` (750 alice:alice) exist. */
const standardRoot = dir({
  root: dir({}, 0o700),
  home: dir({ alice: dir({}, 0o750, 1000, 1000) }),
});

function host(name: string, root: DirectoryNode = standardRoot): Host {
  return {
    name,
    root,
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
    const session = createSession(world, "ws01", "alice");
    expect(session.host).toBe("ws01");
    expect(session.credentials).toEqual({ uid: 1000, gid: 1000, groups: [1000, 27] });
    expect(session.cwd).toBe("/home/alice");
  });

  test("@differential sets the shell variables of a Debian login", () => {
    const session = createSession(world, "ws01", "alice");
    expect(Object.fromEntries(session.variables)).toEqual({
      HOME: "/home/alice",
      HOSTNAME: "ws01",
      IFS: " \t\n",
      LOGNAME: "alice",
      PATH: "/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games",
      PWD: "/home/alice",
      SHELL: "/bin/bash",
      USER: "alice",
    });
    expect(session.variables.has("OLDPWD")).toBe(false);
    expect(session.exitStatus).toBe(0);
  });

  test("@differential gives root the PATH with the sbin directories", () => {
    expect(createSession(world, "ws01", "root").variables.get("PATH")).toBe(
      "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    );
  });

  test("keeps HOME as written in the user list when the session starts in /", () => {
    const withoutHomes = createWorld({ hosts: [host("ws01", dir({}))] });
    const session = createSession(withoutHomes, "ws01", "alice");
    expect(session.variables.get("HOME")).toBe("/home/alice");
    expect(session.variables.get("PWD")).toBe("/");
  });

  test("works on every host of the world", () => {
    const session = createSession(world, "srv01", "root");
    expect(session.host).toBe("srv01");
    expect(session.cwd).toBe("/root");
  });

  test("starts in / when the home directory does not exist", () => {
    const withoutHomes = createWorld({ hosts: [host("ws01", dir({}))] });
    expect(createSession(withoutHomes, "ws01", "alice").cwd).toBe("/");
    expect(createSession(withoutHomes, "ws01", "root").cwd).toBe("/");
  });

  test("starts in / when the home directory is a file", () => {
    const homeIsFile = createWorld({
      hosts: [host("ws01", dir({ home: dir({ alice: profile }) }))],
    });
    expect(createSession(homeIsFile, "ws01", "alice").cwd).toBe("/");
  });

  test("starts in / when the user may not search the way to the home directory", () => {
    const lockedHome = createWorld({
      hosts: [host("ws01", dir({ home: dir({ alice: dir({}, 0o755, 1000, 1000) }, 0o700) }))],
    });
    expect(createSession(lockedHome, "ws01", "alice").cwd).toBe("/");
  });

  test("starts in / when the user may not search the home directory itself", () => {
    const foreignHome = createWorld({
      hosts: [host("ws01", dir({ home: dir({ alice: dir({}, 0o700) }) }))],
    });
    expect(createSession(foreignHome, "ws01", "alice").cwd).toBe("/");
  });

  test("starts in the canonical path of the home directory", () => {
    const original = host("ws01");
    const oddHome: User = {
      name: "alice",
      uid: toUid(1000),
      gid: toGid(1000),
      home: "/home//alice/",
      shell: "/bin/bash",
    };
    const world = createWorld({
      hosts: [
        { ...original, users: original.users.map((u) => (u.name === "alice" ? oddHome : u)) },
      ],
    });
    expect(createSession(world, "ws01", "alice").cwd).toBe("/home/alice");
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
