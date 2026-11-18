import {
  type BaseWorld,
  baseWorldSchema,
  type Level,
  type LevelInput,
  levelSchema,
} from "@penguin-ops/content";
import {
  buildWorld,
  createGameClock,
  findHost,
  findUser,
  lookup,
  toGid,
  toUid,
} from "@penguin-ops/engine";
import { describe, expect, test } from "vitest";

import {
  isValidPlayerName,
  LevelSetupError,
  levelWorldSpec,
  PLAYER_HOME_MODE,
  playerHome,
  startHost,
} from "./level-world";

const WORLD: BaseWorld = baseWorldSchema.parse({
  format: 1,
  id: "office",
  hosts: [
    {
      name: "desk",
      groups: [
        { name: "root", gid: 0 },
        { name: "staff", gid: 50 },
      ],
      users: [{ name: "root", uid: 0 }],
      files: {
        "/etc/motd": "Welcome\n",
        "~/inbox/": {},
        "/etc/app.conf": "debug=true\n",
      },
    },
    {
      name: "server",
      groups: [{ name: "root", gid: 0 }],
      users: [{ name: "root", uid: 0 }],
      files: { "/srv/data.txt": "data\n" },
    },
  ],
});

function level(fields: Partial<LevelInput> = {}): Level {
  return levelSchema.parse({
    format: 1,
    id: "x",
    kind: "main",
    teaches: ["pwd"],
    goal: { cwd_is: "~" },
    solutions: [["pwd"]],
    ...fields,
  });
}

const NO_TEXTS: ReadonlyMap<string, string> = new Map();

describe("isValidPlayerName", () => {
  test.each(["alice", "a", "joerg-2", `a${"b".repeat(31)}`])("accepts %j", (name) => {
    expect(isValidPlayerName(name)).toBe(true);
  });

  test.each(["", "Alice", "1alice", "-a", "jörg", "a b", "a_b", `a${"b".repeat(32)}`])(
    "rejects %j",
    (name) => {
      expect(isValidPlayerName(name)).toBe(false);
    },
  );
});

describe("startHost", () => {
  test("is the first host, or the host that start.host names", () => {
    expect(startHost(WORLD, level()).name).toBe("desk");
    expect(startHost(WORLD, level({ start: { host: "server" } })).name).toBe("server");
  });

  test("throws for a host that the world lacks", () => {
    expect(() => startHost(WORLD, level({ start: { host: "lab" } }))).toThrow(
      new LevelSetupError('the world "office" has no host "lab"'),
    );
  });
});

describe("levelWorldSpec", () => {
  test("adds the player's account to every host, after the world's accounts", () => {
    const spec = levelWorldSpec(WORLD, level(), "alice", NO_TEXTS);
    for (const host of spec.hosts) {
      expect(host.groups.at(-1)).toEqual({ name: "alice", gid: 1000 });
      expect(host.users.at(-1)).toEqual({
        name: "alice",
        uid: 1000,
        group: "alice",
        home: "/home/alice",
      });
      expect(host.files?.["/home/alice/"]).toEqual({ mode: PLAYER_HOME_MODE });
    }
    expect(spec.hosts[0]?.groups.map((group) => group.name)).toEqual(["root", "staff", "alice"]);
    expect(playerHome("alice")).toBe("/home/alice");
    expect(PLAYER_HOME_MODE).toBe(0o700);
  });

  test("puts the start files on the start host only, after the world's files", () => {
    const spec = levelWorldSpec(
      WORLD,
      level({
        start: {
          files: {
            "~/notes.txt": "a\n",
            "/etc/app.conf": { content: "debug=false\n", owner: "root", mode: "rw-r-----" },
            "~/handover.txt": { text: "handover" },
            "/srv/share/": { group: "staff" },
          },
        },
      }),
      "alice",
      new Map([["handover", "Dear successor,\n"]]),
    );
    expect(spec.hosts[0]?.files).toEqual({
      "/home/alice/": { mode: 0o700 },
      "/etc/motd": { content: "Welcome\n" },
      "/home/alice/inbox/": {},
      "/etc/app.conf": { content: "debug=false\n", owner: "root", mode: 0o640 },
      "/home/alice/notes.txt": { content: "a\n" },
      "/home/alice/handover.txt": { content: "Dear successor,\n" },
      "/srv/share/": { group: "staff" },
    });
    expect(spec.hosts[1]?.files).toEqual({
      "/home/alice/": { mode: 0o700 },
      "/srv/data.txt": { content: "data\n" },
    });
  });

  test("builds into a world where the player owns the home and its files", () => {
    const clock = createGameClock(1_000_000);
    const world = buildWorld(
      levelWorldSpec(WORLD, level({ start: { files: { "~/a.txt": "a" } } }), "bob", NO_TEXTS),
      clock,
    );
    const host = findHost(world, "desk");
    expect(host && findUser(host, "bob")).toMatchObject({ uid: 1000, gid: 1000 });
    const root = { uid: toUid(0), gid: toGid(0), groups: [toGid(0)] };
    const home = host && lookup(host.root, root, "/", "/home/bob");
    expect(home?.ok && home.node).toMatchObject({ kind: "directory", owner: 1000, mode: 0o700 });
    const file = host && lookup(host.root, root, "/", "/home/bob/a.txt");
    expect(file?.ok && file.node).toMatchObject({ kind: "file", owner: 1000, group: 1000 });
  });

  test("rejects an invalid player name", () => {
    expect(() => levelWorldSpec(WORLD, level(), "Alice", NO_TEXTS)).toThrow(
      new LevelSetupError(
        '"Alice" is not a valid user name: a lowercase letter, then up to 31 lowercase letters, digits and hyphens',
      ),
    );
  });

  test.each(["root", "staff"])("rejects the name %j, a user or group of the world", (name) => {
    expect(() => levelWorldSpec(WORLD, level(), name, NO_TEXTS)).toThrow(
      new LevelSetupError(`the user name "${name}" is already taken on the host "desk"`),
    );
  });

  test("throws for a prose file without its text and for an unknown start host", () => {
    const prose = level({ start: { files: { "~/a.txt": { text: "handover" } } } });
    expect(() => levelWorldSpec(WORLD, prose, "alice", NO_TEXTS)).toThrow(
      new LevelSetupError('there is no text "handover" for a start file'),
    );
    expect(() =>
      levelWorldSpec(WORLD, level({ start: { host: "lab" } }), "alice", NO_TEXTS),
    ).toThrow(LevelSetupError);
  });
});
