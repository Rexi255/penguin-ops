import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import type { DirectoryNode, FsNode } from "./fs-node";
import { toGid, toUid } from "./ids";
import { lookup } from "./lookup";
import { createSession } from "./session";
import { buildWorld, type HostSpec, type NodeSpec, type WorldSpec } from "./world-builder";
import { findHost, type Host, InvalidWorldError, type World } from "./world";

// 2026-03-02T08:00:00Z, a Monday morning.
const START = Date.UTC(2026, 2, 2, 8, 0, 0);
const clock = createGameClock(START);

const ROOT_CREDENTIALS = { uid: toUid(0), gid: toGid(0), groups: [toGid(0)] };

/** An office workstation with root, alice (in sudo and it), bob (in it) and www-data. */
function workstation(files: Record<string, NodeSpec> = {}, changes: Partial<HostSpec> = {}) {
  const host: HostSpec = {
    name: "ws01",
    groups: [
      { name: "root", gid: 0 },
      { name: "sudo", gid: 27, members: ["alice"] },
      { name: "www-data", gid: 33 },
      { name: "alice", gid: 1000 },
      { name: "bob", gid: 1001 },
      { name: "it", gid: 1100, members: ["alice", "bob"] },
    ],
    users: [
      { name: "root", uid: 0 },
      { name: "www-data", uid: 33, home: "/var/www", shell: "/usr/sbin/nologin" },
      { name: "alice", uid: 1000 },
      { name: "bob", uid: 1001 },
    ],
    files,
    ...changes,
  };
  return host;
}

function build(...hosts: HostSpec[]): World {
  return buildWorld({ hosts }, clock);
}

function onlyHost(world: World): Host {
  const host = findHost(world, "ws01");
  if (host === undefined) {
    throw new Error("the test world has no host ws01");
  }
  return host;
}

/** Returns the node at the absolute `path`, looked up as root. */
function nodeAt(world: World, path: string): FsNode {
  const result = lookup(onlyHost(world).root, ROOT_CREDENTIALS, "/", path);
  if (!result.ok) {
    throw new Error(`${path}: ${result.error}`);
  }
  return result.node;
}

function directoryAt(world: World, path: string): DirectoryNode {
  const node = nodeAt(world, path);
  if (node.kind !== "directory") {
    throw new Error(`${path} is not a directory`);
  }
  return node;
}

function expectInvalid(spec: WorldSpec, message: string): void {
  expect(() => buildWorld(spec, clock)).toThrow(InvalidWorldError);
  expect(() => buildWorld(spec, clock)).toThrow(message);
}

describe("buildWorld: users and groups", () => {
  test("keeps the order of users and groups and fills in the defaults", () => {
    const host = onlyHost(build(workstation()));
    expect(host.groups.map((group) => group.name)).toEqual([
      "root",
      "sudo",
      "www-data",
      "alice",
      "bob",
      "it",
    ]);
    expect(host.users).toEqual([
      { name: "root", uid: 0, gid: 0, home: "/root", shell: "/bin/bash" },
      { name: "www-data", uid: 33, gid: 33, home: "/var/www", shell: "/usr/sbin/nologin" },
      { name: "alice", uid: 1000, gid: 1000, home: "/home/alice", shell: "/bin/bash" },
      { name: "bob", uid: 1001, gid: 1001, home: "/home/bob", shell: "/bin/bash" },
    ]);
  });

  test("group members default to none and keep their order", () => {
    const host = onlyHost(build(workstation()));
    expect(host.groups.find((group) => group.name === "root")?.members).toEqual([]);
    expect(host.groups.find((group) => group.name === "it")?.members).toEqual(["alice", "bob"]);
  });

  test("a user can have another primary group than the one with the user's name", () => {
    const host = onlyHost(
      build(
        workstation(
          {},
          {
            groups: [
              { name: "root", gid: 0 },
              { name: "it", gid: 1100 },
            ],
            users: [
              { name: "root", uid: 0 },
              { name: "carol", uid: 1002, group: "it" },
            ],
          },
        ),
      ),
    );
    expect(host.users[1]?.gid).toBe(1100);
  });

  test("rejects a user whose primary group does not exist", () => {
    expectInvalid(
      { hosts: [workstation({}, { users: [{ name: "dave", uid: 1003 }] })] },
      'host "ws01": user "dave" has the primary group "dave", which does not exist',
    );
  });

  test.each([-1, 1.5, 2 ** 32 - 1])("rejects the uid %s", (uid) => {
    expectInvalid(
      { hosts: [workstation({}, { users: [{ name: "root", uid, group: "root" }] })] },
      `host "ws01": user "root" has the invalid uid ${String(uid)}`,
    );
  });

  test.each([-1, 1.5, 2 ** 32 - 1])("rejects the gid %s", (gid) => {
    expectInvalid(
      { hosts: [workstation({}, { groups: [{ name: "root", gid }], users: [] })] },
      `host "ws01": group "root" has the invalid gid ${String(gid)}`,
    );
  });

  test("passes the checks of createWorld on, for example duplicate uids", () => {
    expectInvalid(
      {
        hosts: [
          workstation(
            {},
            {
              users: [
                { name: "alice", uid: 1000 },
                { name: "bob", uid: 1000 },
              ],
            },
          ),
        ],
      },
      'host "ws01": duplicate uid 1000 (users "alice" and "bob")',
    );
  });

  test("passes the checks of createWorld on, for example unknown group members", () => {
    expectInvalid(
      {
        hosts: [
          workstation({}, { groups: [{ name: "root", gid: 0, members: ["eve"] }], users: [] }),
        ],
      },
      'group "root" lists the unknown member "eve"',
    );
  });
});

describe("buildWorld: files and directories", () => {
  test("without files the host has only an empty root directory owned by root", () => {
    const { name, groups, users } = workstation();
    const world = build({ name, groups, users });
    expect(onlyHost(world).root).toEqual({
      kind: "directory",
      owner: 0,
      group: 0,
      mode: 0o755,
      mtime: START,
      entries: new Map(),
    });
  });

  test("a string is the content of a file with default attributes", () => {
    const world = build(workstation({ "/etc/hostname": "ws01\n" }));
    expect(nodeAt(world, "/etc/hostname")).toEqual({
      kind: "file",
      owner: 0,
      group: 0,
      mode: 0o644,
      mtime: START,
      content: "ws01\n",
    });
  });

  test("creates missing parent directories with default attributes", () => {
    const world = build(workstation({ "/srv/share/it/readme.txt": "IT share\n" }));
    for (const path of ["/srv", "/srv/share", "/srv/share/it"]) {
      const { entries, ...attributes } = directoryAt(world, path);
      expect(attributes).toEqual({
        kind: "directory",
        owner: 0,
        group: 0,
        mode: 0o755,
        mtime: START,
      });
      expect(entries.size).toBe(1);
    }
  });

  test("a path that ends with / is a directory, {} an empty one", () => {
    const world = build(workstation({ "/home/alice/projects/": {} }));
    expect(directoryAt(world, "/home/alice/projects").entries.size).toBe(0);
  });

  test("an object without content is an empty file", () => {
    const world = build(workstation({ "/var/log/empty.log": { mode: 0o640 } }));
    expect(nodeAt(world, "/var/log/empty.log")).toMatchObject({
      kind: "file",
      content: "",
      mode: 0o640,
    });
  });

  test("explicit owner, group, mode and mtime are used", () => {
    const world = build(
      workstation({
        "/etc/app.conf": {
          content: "debug=false\n",
          owner: "www-data",
          group: "it",
          mode: 0o640,
          mtime: 1000,
        },
        "/srv/share/": { group: "it", mode: 0o2770 },
      }),
    );
    expect(nodeAt(world, "/etc/app.conf")).toEqual({
      kind: "file",
      owner: 33,
      group: 1100,
      mode: 0o640,
      mtime: 1000,
      content: "debug=false\n",
    });
    expect(directoryAt(world, "/srv/share")).toMatchObject({ owner: 0, group: 1100, mode: 0o2770 });
  });

  test("the default group is the primary group of an explicit owner", () => {
    const world = build(workstation({ "/srv/report.txt": { owner: "bob" } }));
    expect(nodeAt(world, "/srv/report.txt")).toMatchObject({ owner: 1001, group: 1001 });
  });

  test("an explicit group without an owner keeps the default owner", () => {
    const world = build(workstation({ "/srv/report.txt": { group: "it" } }));
    expect(nodeAt(world, "/srv/report.txt")).toMatchObject({ owner: 0, group: 1100 });
  });

  test("/ sets the attributes of the root directory", () => {
    const world = build(workstation({ "/": { mode: 0o700 }, "/etc/hostname": "ws01\n" }));
    expect(onlyHost(world).root).toMatchObject({ mode: 0o700, owner: 0 });
    expect(nodeAt(world, "/etc/hostname")).toMatchObject({ content: "ws01\n" });
  });

  test("a directory listed after its contents still gets its own attributes", () => {
    const world = build(
      workstation({ "/srv/share/readme.txt": "hi\n", "/srv/share/": { mode: 0o750, group: "it" } }),
    );
    expect(directoryAt(world, "/srv/share")).toMatchObject({ mode: 0o750, group: 1100 });
    expect(nodeAt(world, "/srv/share/readme.txt")).toMatchObject({ content: "hi\n" });
  });

  test("repeated slashes are ignored like in a real path", () => {
    const world = build(workstation({ "//etc///hostname": "ws01\n" }));
    expect(nodeAt(world, "/etc/hostname")).toMatchObject({ content: "ws01\n" });
  });

  test("directory entries keep the order of the files", () => {
    const world = build(workstation({ "/tmp/b": "", "/tmp/a": "", "/tmp/c/": {} }));
    expect([...directoryAt(world, "/tmp").entries.keys()]).toEqual(["b", "a", "c"]);
  });

  test("the default mtime is the clock's time when the world is built", () => {
    const gameClock = createGameClock(START);
    gameClock.advance(3_600_000);
    const world = buildWorld({ hosts: [workstation({ "/etc/hostname": "ws01\n" })] }, gameClock);
    expect(nodeAt(world, "/etc/hostname").mtime).toBe(START + 3_600_000);
    expect(onlyHost(world).root.mtime).toBe(START + 3_600_000);
  });

  test("the same spec and time always give the same world", () => {
    const files = { "/etc/hostname": "ws01\n", "/home/alice/notes.txt": "buy fish\n" };
    expect(build(workstation(files))).toEqual(build(workstation(files)));
  });

  test("builds several hosts, each with its own file system", () => {
    const world = build(
      workstation({ "/etc/hostname": "ws01\n" }),
      workstation({ "/etc/hostname": "srv01\n" }, { name: "srv01" }),
    );
    expect(world.hosts.map((host) => host.name)).toEqual(["ws01", "srv01"]);
    const srv = findHost(world, "srv01");
    const hostname =
      srv === undefined ? undefined : lookup(srv.root, ROOT_CREDENTIALS, "/", "/etc/hostname");
    expect(hostname).toMatchObject({ ok: true, node: { content: "srv01\n" } });
  });

  test("a built world works with sessions: alice starts in her home directory", () => {
    const world = build(workstation({ "/home/alice/": { mode: 0o700 } }));
    expect(createSession(world, "ws01", "alice").cwd).toBe("/home/alice");
    expect(createSession(world, "ws01", "bob").cwd).toBe("/");
  });
});

describe("buildWorld: default owner from home directories", () => {
  test("a regular user owns the home directory and everything in it", () => {
    const world = build(workstation({ "/home/alice/tickets/printer.txt": "10.20.2.50\n" }));
    for (const path of ["/home/alice", "/home/alice/tickets", "/home/alice/tickets/printer.txt"]) {
      expect(nodeAt(world, path)).toMatchObject({ owner: 1000, group: 1000 });
    }
    expect(nodeAt(world, "/home")).toMatchObject({ owner: 0, group: 0 });
  });

  test("a path that only starts with the same letters is not inside the home", () => {
    const world = build(workstation({ "/home/alice2/notes.txt": "" }));
    expect(nodeAt(world, "/home/alice2/notes.txt")).toMatchObject({ owner: 0, group: 0 });
  });

  test("files in the home of a system user belong to root, like /var/www on Debian", () => {
    const world = build(workstation({ "/var/www/html/index.html": "<h1>It works</h1>\n" }));
    expect(nodeAt(world, "/var/www/html/index.html")).toMatchObject({ owner: 0, group: 0 });
  });

  test("files in /root belong to root", () => {
    const world = build(workstation({ "/root/.bashrc": "" }));
    expect(nodeAt(world, "/root/.bashrc")).toMatchObject({ owner: 0, group: 0 });
  });

  test("an explicit owner wins over the home rule", () => {
    const world = build(workstation({ "/home/alice/shared.txt": { owner: "bob" } }));
    expect(nodeAt(world, "/home/alice/shared.txt")).toMatchObject({ owner: 1001, group: 1001 });
  });

  test("with nested homes the innermost home wins", () => {
    const world = build(
      workstation(
        { "/home/alice/bob/notes.txt": "", "/home/alice/notes.txt": "" },
        {
          users: [
            { name: "alice", uid: 1000 },
            { name: "bob", uid: 1001, home: "/home/alice/bob" },
          ],
        },
      ),
    );
    expect(nodeAt(world, "/home/alice/bob/notes.txt")).toMatchObject({ owner: 1001 });
    expect(nodeAt(world, "/home/alice/notes.txt")).toMatchObject({ owner: 1000 });
  });

  test("a home given with a trailing slash still matches", () => {
    const world = build(
      workstation(
        { "/home/alice/notes.txt": "" },
        {
          users: [
            { name: "alice", uid: 1000, home: "/home/alice/" },
            { name: "bob", uid: 1001 },
          ],
        },
      ),
    );
    expect(nodeAt(world, "/home/alice/notes.txt")).toMatchObject({ owner: 1000 });
  });
});

describe("buildWorld: errors in files", () => {
  const cases: [string, Record<string, NodeSpec>, string][] = [
    ["a relative path", { "etc/hostname": "" }, 'the path "etc/hostname" is not absolute'],
    ["an empty path", { "": "" }, 'the path "" is not absolute'],
    ["a . component", { "/etc/./hostname": "" }, 'the path "/etc/./hostname" contains "."'],
    ["a .. component", { "/etc/../hostname": "" }, 'the path "/etc/../hostname" contains ".."'],
    [
      "a directory with string content",
      { "/srv/": "x" },
      'the directory "/srv/" cannot have content',
    ],
    [
      "a directory with content",
      { "/srv/": { content: "x" } },
      'the directory "/srv/" cannot have content',
    ],
    [
      "a file listed twice",
      { "/etc/hostname": "a", "/etc//hostname": "b" },
      'the path "/etc//hostname" is listed more than once',
    ],
    [
      "a directory listed twice",
      { "/srv/": {}, "/srv//": {} },
      'the path "/srv//" is listed more than once',
    ],
    ["/ listed twice", { "/": {}, "//": {} }, 'the path "//" is listed more than once'],
    [
      "a file below a file",
      { "/etc/hostname": "", "/etc/hostname/x": "" },
      'the path "/etc/hostname/x" needs "/etc/hostname" to be a directory, but it is a file',
    ],
    [
      "a directory with the path of a file",
      { "/srv": "", "/srv/": {} },
      'the path "/srv/" needs "/srv" to be a directory, but it is a file',
    ],
    [
      "a file with the path of a directory",
      { "/srv/data/x": "", "/srv/data": "" },
      'the path "/srv/data" is listed as a file, but other paths need it to be a directory',
    ],
    [
      "an unknown owner",
      { "/x": { owner: "eve" } },
      '"/x" has the owner "eve", which does not exist',
    ],
    [
      "an unknown group",
      { "/srv/x/y": { group: "staff" } },
      '"/srv/x/y" has the group "staff", which does not exist',
    ],
    [
      "an invalid mode, checked by createWorld",
      { "/x": { mode: 0o10000 } },
      "/x has an invalid mode 4096",
    ],
    [
      "an invalid mtime, checked by createWorld",
      { "/x": { mtime: 1.5 } },
      "/x has an invalid mtime 1.5",
    ],
    [
      "an invalid name, checked by createWorld",
      { "/etc/a\0b": "" },
      '/etc has an entry with the invalid name "a\\u0000b"',
    ],
  ];

  test.each(cases)("rejects %s", (_name, files, message) => {
    expectInvalid({ hosts: [workstation(files)] }, `host "ws01": ${message}`);
  });

  test("names the host with the problem", () => {
    expectInvalid(
      { hosts: [workstation(), workstation({ x: "" }, { name: "srv01" })] },
      'host "srv01": the path "x" is not absolute',
    );
  });

  test("rejects an empty world, checked by createWorld", () => {
    expectInvalid({ hosts: [] }, "a world needs at least one host");
  });
});
