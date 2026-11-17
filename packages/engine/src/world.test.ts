import { describe, expect, test } from "vitest";

import type { DirectoryNode, FileNode, FsNode } from "./fs-node";
import { toGid, toUid } from "./ids";
import {
  createWorld,
  findGroup,
  findGroupByGid,
  findHost,
  findUser,
  findUserByUid,
  type Group,
  groupIdsOf,
  type Host,
  InvalidWorldError,
  replaceHostRoot,
  type User,
} from "./world";

const ROOT = toUid(0);
const ROOT_GROUP = toGid(0);

function file(content: string, changes: Partial<FileNode> = {}): FileNode {
  return {
    kind: "file",
    owner: ROOT,
    group: ROOT_GROUP,
    mode: 0o644,
    mtime: 0,
    content,
    ...changes,
  };
}

function dir(entries: Record<string, FsNode> = {}, changes: Partial<DirectoryNode> = {}) {
  const node: DirectoryNode = {
    kind: "directory",
    owner: ROOT,
    group: ROOT_GROUP,
    mode: 0o755,
    mtime: 0,
    entries: new Map(Object.entries(entries)),
    ...changes,
  };
  return node;
}

function user(name: string, uid: number, gid: number): User {
  return { name, uid: toUid(uid), gid: toGid(gid), home: `/home/${name}`, shell: "/bin/bash" };
}

function group(name: string, gid: number, members: string[] = []): Group {
  return { name, gid: toGid(gid), members };
}

/** A small office workstation: root, alice and bob; alice is in the groups sudo and it. */
function workstation(changes: Partial<Host> = {}): Host {
  return {
    name: "ws01",
    root: dir({
      etc: dir({ hostname: file("ws01\n") }),
      home: dir({
        alice: dir({ "notes.txt": file("hi\n") }, { owner: toUid(1000), mode: 0o700 }),
      }),
    }),
    users: [user("root", 0, 0), user("alice", 1000, 1000), user("bob", 1001, 1001)],
    groups: [
      group("root", 0),
      group("sudo", 27, ["alice"]),
      group("alice", 1000),
      group("bob", 1001),
      group("it", 1100, ["bob", "alice"]),
    ],
    ...changes,
  };
}

function expectInvalid(hosts: Host[], message: string): void {
  expect(() => createWorld({ hosts })).toThrow(InvalidWorldError);
  expect(() => createWorld({ hosts })).toThrow(message);
}

describe("createWorld", () => {
  test("returns a world with the given hosts", () => {
    const host = workstation();
    const world = createWorld({ hosts: [host] });
    expect(world.hosts).toEqual([host]);
    expect(world.hosts[0]).toBe(host);
  });

  test("accepts several hosts", () => {
    const world = createWorld({ hosts: [workstation(), workstation({ name: "srv-web01" })] });
    expect(world.hosts.map((host) => host.name)).toEqual(["ws01", "srv-web01"]);
  });

  test("copies the host list, so later changes to the input do not reach the world", () => {
    const hosts = [workstation()];
    const world = createWorld({ hosts });
    hosts.push(workstation({ name: "ws02" }));
    expect(world.hosts).toHaveLength(1);
  });

  test("accepts file owners and groups that belong to no user or group", () => {
    const orphan = file("old\n", { owner: toUid(1234), group: toGid(1234) });
    expect(() =>
      createWorld({ hosts: [workstation({ root: dir({ old: orphan }) })] }),
    ).not.toThrow();
  });

  test("the error has the name InvalidWorldError", () => {
    expect(() => createWorld({ hosts: [] })).toThrow(
      expect.objectContaining({ name: "InvalidWorldError" }),
    );
  });

  describe("rejects", () => {
    test("a world without hosts", () => {
      expectInvalid([], "a world needs at least one host");
    });

    test("duplicate host names", () => {
      expectInvalid([workstation(), workstation()], 'duplicate host name "ws01"');
    });

    test.each(["", "WS01", "ws_01", "-ws", "ws-", "ws.example", "a".repeat(64)])(
      "the host name %j",
      (name) => {
        expectInvalid([workstation({ name })], `invalid host name "${name}"`);
      },
    );

    test.each(["", "a b", "a:b", "a/b", "tab\t"])("the user name %j", (name) => {
      const users = [user("root", 0, 0), user(name, 1000, 1000)];
      expectInvalid(
        [workstation({ users, groups: [group("root", 0), group("alice", 1000)] })],
        `host "ws01": invalid user name`,
      );
    });

    test("duplicate user names", () => {
      const users = [
        user("root", 0, 0),
        user("alice", 1000, 1000),
        user("bob", 1001, 1001),
        user("alice", 1002, 1000),
      ];
      expectInvalid([workstation({ users })], 'host "ws01": duplicate user name "alice"');
    });

    test("duplicate UIDs", () => {
      const users = [user("root", 0, 0), user("alice", 1000, 1000), user("bob", 1000, 1001)];
      expectInvalid(
        [
          workstation({
            users,
            groups: [group("root", 0), group("alice", 1000), group("bob", 1001)],
          }),
        ],
        'host "ws01": duplicate uid 1000 (users "alice" and "bob")',
      );
    });

    test("a primary group that does not exist", () => {
      const users = [user("root", 0, 0), user("alice", 1000, 4242)];
      expectInvalid(
        [workstation({ users, groups: [group("root", 0)] })],
        'host "ws01": user "alice" has primary gid 4242, but no group has it',
      );
    });

    test("a home that is not an absolute path", () => {
      const users = [user("root", 0, 0), { ...user("alice", 1000, 1000), home: "home/alice" }];
      expectInvalid(
        [workstation({ users, groups: [group("root", 0), group("alice", 1000)] })],
        'user "alice" has a home that is not an absolute path: "home/alice"',
      );
    });

    test("a shell that is not an absolute path", () => {
      const users = [user("root", 0, 0), { ...user("alice", 1000, 1000), shell: "bash" }];
      expectInvalid(
        [workstation({ users, groups: [group("root", 0), group("alice", 1000)] })],
        'user "alice" has a shell that is not an absolute path: "bash"',
      );
    });

    test.each(["", "it staff", "it:staff"])("the group name %j", (name) => {
      expectInvalid(
        [
          workstation({
            users: [user("root", 0, 0)],
            groups: [group("root", 0), group(name, 1100)],
          }),
        ],
        'host "ws01": invalid group name',
      );
    });

    test("duplicate group names", () => {
      const groups = [group("root", 0), group("it", 1100), group("it", 1101)];
      expectInvalid(
        [workstation({ users: [user("root", 0, 0)], groups })],
        'duplicate group name "it"',
      );
    });

    test("duplicate GIDs", () => {
      const groups = [group("root", 0), group("it", 1100), group("staff", 1100)];
      expectInvalid(
        [workstation({ users: [user("root", 0, 0)], groups })],
        'duplicate gid 1100 (groups "it" and "staff")',
      );
    });

    test("a group member that is not a user", () => {
      const groups = [group("root", 0), group("it", 1100, ["carol"])];
      expectInvalid(
        [workstation({ users: [user("root", 0, 0)], groups })],
        'group "it" lists the unknown member "carol"',
      );
    });

    test("a group member listed twice", () => {
      const groups = [group("root", 0, ["root", "root"])];
      expectInvalid(
        [workstation({ users: [user("root", 0, 0)], groups })],
        'group "root" lists the member "root" twice',
      );
    });

    test.each([".", "..", "", "a/b", "a\0b"])("the entry name %j", (name) => {
      const root = dir({ home: dir({ [name]: file("x") }) });
      expectInvalid(
        [workstation({ root })],
        `host "ws01": /home has an entry with the invalid name ${JSON.stringify(name)}`,
      );
    });

    test("an invalid mode on a nested file, naming its path", () => {
      const root = dir({ etc: dir({ hostname: file("ws01\n", { mode: 0o100644 }) }) });
      expectInvalid(
        [workstation({ root })],
        `/etc/hostname has an invalid mode ${String(0o100644)}`,
      );
    });

    test("an invalid mode on the root directory", () => {
      expectInvalid([workstation({ root: dir({}, { mode: -1 }) })], "/ has an invalid mode -1");
    });

    test.each([1.5, Number.NaN, 2 ** 53])("the mtime %d", (mtime) => {
      expectInvalid(
        [workstation({ root: dir({ a: file("", { mtime }) }) })],
        "/a has an invalid mtime",
      );
    });
  });
});

describe("lookups", () => {
  const world = createWorld({ hosts: [workstation(), workstation({ name: "ws02" })] });
  const host = workstation();

  test("findHost finds a host by name", () => {
    expect(findHost(world, "ws02")?.name).toBe("ws02");
  });

  test("findHost returns undefined for an unknown host", () => {
    expect(findHost(world, "nas01")).toBeUndefined();
  });

  test("findUser and findUserByUid find the same user", () => {
    expect(findUser(host, "alice")?.uid).toBe(1000);
    expect(findUserByUid(host, toUid(1000))?.name).toBe("alice");
  });

  test("findUser and findUserByUid return undefined for unknown users", () => {
    expect(findUser(host, "carol")).toBeUndefined();
    expect(findUserByUid(host, toUid(4242))).toBeUndefined();
  });

  test("findGroup and findGroupByGid find the same group", () => {
    expect(findGroup(host, "sudo")?.gid).toBe(27);
    expect(findGroupByGid(host, toGid(27))?.name).toBe("sudo");
  });

  test("findGroup and findGroupByGid return undefined for unknown groups", () => {
    expect(findGroup(host, "wheel")).toBeUndefined();
    expect(findGroupByGid(host, toGid(4242))).toBeUndefined();
  });

  test("user names are case-sensitive", () => {
    expect(findUser(host, "Alice")).toBeUndefined();
  });
});

describe("replaceHostRoot", () => {
  const world = createWorld({ hosts: [workstation(), workstation({ name: "ws02" })] });
  const emptyRoot = dir();

  test("gives the named host the new root and keeps everything else", () => {
    const changed = replaceHostRoot(world, "ws02", emptyRoot);
    const before = findHost(world, "ws02");
    const after = findHost(changed, "ws02");
    expect(after?.root).toBe(emptyRoot);
    expect(after?.users).toBe(before?.users);
    expect(after?.groups).toBe(before?.groups);
    expect(findHost(changed, "ws01")).toBe(findHost(world, "ws01"));
    expect(changed.hosts.map((host) => host.name)).toEqual(["ws01", "ws02"]);
  });

  test("leaves the old world unchanged", () => {
    const before = findHost(world, "ws01")?.root;
    replaceHostRoot(world, "ws01", emptyRoot);
    expect(findHost(world, "ws01")?.root).toBe(before);
  });

  test("throws for an unknown host", () => {
    expect(() => replaceHostRoot(world, "nas01", emptyRoot)).toThrow(
      'no host "nas01" in the world',
    );
  });
});

describe("groupIdsOf", () => {
  const host = workstation();

  function idsOf(name: string): readonly number[] {
    const found = findUser(host, name);
    if (found === undefined) {
      throw new Error(`fixture has no user ${name}`);
    }
    return groupIdsOf(host, found);
  }

  test("lists the primary group first, then supplementary groups in /etc/group order", () => {
    expect(idsOf("alice")).toEqual([1000, 27, 1100]);
  });

  test("a user without supplementary groups has only the primary group", () => {
    expect(idsOf("root")).toEqual([0]);
  });

  test("a primary group that also lists the user as a member appears only once", () => {
    const listed = workstation({
      groups: [group("root", 0), group("alice", 1000, ["alice"]), group("bob", 1001)],
    });
    const alice = findUser(listed, "alice");
    expect(alice && groupIdsOf(listed, alice)).toEqual([1000]);
  });
});
