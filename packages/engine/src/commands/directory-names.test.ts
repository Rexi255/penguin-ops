import { describe, expect, test } from "vitest";

import { createGameClock } from "../clock";
import { createSession } from "../session";
import { buildWorld } from "../world-builder";
import {
  canonicalPath,
  changeDirectory,
  currentDirectory,
  type DirectoryView,
  directoryView,
  makeAbsolute,
  physicalPath,
} from "./directory-names";

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [{ name: "alice", gid: 1000 }],
        users: [{ name: "alice", uid: 1000 }],
        files: {
          "/home/alice/notes.txt": "",
          "/srv/locked/": { mode: 0o700 },
          "/srv/locked/inner/": {},
        },
      },
    ],
  },
  createGameClock(0),
);

const alice = createSession(world, "ws01", "alice");
const view = directoryView(world, alice);

function at(cwd: string): DirectoryView {
  return { ...view, cwd };
}

describe("directoryView", () => {
  test("throws for a session whose host is not part of the world", () => {
    expect(() => directoryView(world, { ...alice, host: "gone" })).toThrow(
      'the session\'s host "gone" is not part of the world',
    );
  });
});

describe("makeAbsolute", () => {
  test.each([
    ["/tmp", "/home/alice", "/tmp"],
    ["docs", "/home/alice", "/home/alice/docs"],
    ["docs", "/", "/docs"],
    ["docs", "//", "//docs"],
    ["", "/home/alice", "/home/alice/"],
  ])("%s in %s is %s", (path, cwd, expected) => {
    expect(makeAbsolute(path, cwd)).toBe(expected);
  });
});

describe("canonicalPath", () => {
  test.each([
    ["/", "/"],
    ["/home/./alice/", "/home/alice"],
    ["/home/alice/../..", "/"],
    ["/..", "/"],
    ["//home", "//home"],
    ["//", "//"],
    ["///home", "/home"],
  ])("%s is %s", (path, expected) => {
    expect(canonicalPath(view, path)).toBe(expected);
  });

  test.each([
    ["a missing directory", "/home/gone/.."],
    ["a file", "/home/alice/notes.txt"],
    ["a file before `..`", "/home/alice/notes.txt/.."],
    ["a directory behind one that may not be searched", "/srv/locked/inner"],
  ])("fails for %s", (_case, path) => {
    expect(canonicalPath(view, path)).toBeUndefined();
  });
});

describe("physicalPath", () => {
  test("accepts files and removes `..` without a check", () => {
    expect(physicalPath(view, "/home/alice/notes.txt/..")).toBe("/home/alice");
    expect(physicalPath(view, "//home/./alice")).toBe("//home/alice");
  });

  test("fails for missing names and names behind a locked directory", () => {
    expect(physicalPath(view, "/home/gone")).toBeUndefined();
    expect(physicalPath(view, "/srv/locked/inner")).toBeUndefined();
  });
});

describe("changeDirectory", () => {
  test("gives the canonical path of a directory", () => {
    expect(changeDirectory(view, "../alice/")).toEqual({ ok: true, path: "/home/alice" });
  });

  test.each([
    ["missing", "ENOENT"],
    ["notes.txt", "ENOTDIR"],
    ["/srv/locked", "EACCES"],
  ])("%s fails with %s", (path, error) => {
    expect(changeDirectory(view, path)).toEqual({ ok: false, error });
  });
});

describe("currentDirectory", () => {
  test("gives the physical name of an existing directory without checks", () => {
    expect(currentDirectory(at("//srv/locked/inner"))).toBe("/srv/locked/inner");
  });

  test("gives nothing for a removed directory or a file", () => {
    expect(currentDirectory(at("/home/alice/gone"))).toBeUndefined();
    expect(currentDirectory(at("/home/alice/notes.txt"))).toBeUndefined();
  });
});
