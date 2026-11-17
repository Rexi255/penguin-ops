import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import { openForReading, readOpenFile } from "./fs-read";
import { createSession, type Session } from "./session";
import { buildWorld } from "./world-builder";

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [
          { name: "root", gid: 0 },
          { name: "alice", gid: 1000 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "alice", uid: 1000 },
        ],
        files: {
          "/etc/hostname": "ws01\n",
          "/home/alice/notes.txt": "hello\n",
          "/home/alice/drop.txt": { content: "secret\n", mode: 0o200 },
          "/home/alice/docs/": {},
          "/home/alice/hidden/": { mode: 0o300 },
          "/srv/closed/": { mode: 0o700 },
          "/srv/closed/inside.txt": "inside\n",
        },
      },
    ],
  },
  createGameClock(1_000),
);

function session(user: string): Session {
  return createSession(world, "ws01", user);
}

describe("openForReading", () => {
  test("opens a file with its canonical path and content", () => {
    expect(openForReading(world, session("alice"), "/home/alice/notes.txt")).toEqual({
      ok: true,
      opened: { kind: "file", path: "/home/alice/notes.txt", content: "hello\n" },
    });
  });

  test("resolves relative paths from the working directory", () => {
    expect(openForReading(world, session("alice"), "docs/../notes.txt")).toEqual({
      ok: true,
      opened: { kind: "file", path: "/home/alice/notes.txt", content: "hello\n" },
    });
  });

  test("opens a readable directory", () => {
    expect(openForReading(world, session("alice"), "docs")).toEqual({
      ok: true,
      opened: { kind: "directory" },
    });
  });

  test("fails with the lookup errors", () => {
    const alice = session("alice");
    expect(openForReading(world, alice, "missing.txt")).toEqual({ ok: false, error: "ENOENT" });
    expect(openForReading(world, alice, "/etc/hostname/x")).toEqual({
      ok: false,
      error: "ENOTDIR",
    });
    expect(openForReading(world, alice, "/etc/hostname/")).toEqual({
      ok: false,
      error: "ENOTDIR",
    });
    expect(openForReading(world, alice, "/srv/closed/inside.txt")).toEqual({
      ok: false,
      error: "EACCES",
    });
  });

  test("fails with EACCES without read permission on a file or directory", () => {
    const alice = session("alice");
    expect(openForReading(world, alice, "drop.txt")).toEqual({ ok: false, error: "EACCES" });
    expect(openForReading(world, alice, "hidden")).toEqual({ ok: false, error: "EACCES" });
  });

  test("lets root read everything", () => {
    expect(openForReading(world, session("root"), "/srv/closed/inside.txt")).toEqual({
      ok: true,
      opened: { kind: "file", path: "/srv/closed/inside.txt", content: "inside\n" },
    });
    expect(openForReading(world, session("root"), "/home/alice/drop.txt")).toMatchObject({
      ok: true,
    });
  });

  test("by throwing when the session's host is not part of the world", () => {
    const lost: Session = { ...session("alice"), host: "gone" };
    expect(() => openForReading(world, lost, "/etc/hostname")).toThrow(
      `the session's host "gone" is not part of the world`,
    );
  });
});

describe("readOpenFile", () => {
  test("returns the current content without permission checks", () => {
    expect(readOpenFile(world, "ws01", "/home/alice/notes.txt")).toBe("hello\n");
    expect(readOpenFile(world, "ws01", "/home/alice/drop.txt")).toBe("secret\n");
    expect(readOpenFile(world, "ws01", "/srv/closed/inside.txt")).toBe("inside\n");
  });

  test("returns the empty text if no file is at the path any more", () => {
    expect(readOpenFile(world, "ws01", "/home/alice/gone.txt")).toBe("");
    expect(readOpenFile(world, "ws01", "/home/alice/docs")).toBe("");
    expect(readOpenFile(world, "ws01", "/etc/hostname/x")).toBe("");
  });

  test("by throwing when the host is not part of the world", () => {
    expect(() => readOpenFile(world, "gone", "/etc/hostname")).toThrow(
      `the host "gone" is not part of the world`,
    );
  });
});
