import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import { openDirectory, openForReading, readOpenFile } from "./fs-read";
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

describe("openDirectory", () => {
  const dot = { name: ".", kind: "directory" };
  const dotDot = { name: "..", kind: "directory" };

  test("returns the entries with their kinds after . and ..", () => {
    const opened = openDirectory(world, session("alice"), "/home/alice");
    expect(opened.ok).toBe(true);
    const entries = opened.ok ? opened.entries : [];
    expect(entries.slice(0, 2)).toEqual([dot, dotDot]);
    expect([...entries.slice(2)].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "docs", kind: "directory" },
      { name: "drop.txt", kind: "file" },
      { name: "hidden", kind: "directory" },
      { name: "notes.txt", kind: "file" },
    ]);
  });

  test("returns only . and .. for an empty directory, also from a relative path", () => {
    const alice = session("alice");
    expect(openDirectory(world, alice, "docs")).toEqual({ ok: true, entries: [dot, dotDot] });
    expect(openDirectory(world, alice, "docs/")).toEqual({ ok: true, entries: [dot, dotDot] });
  });

  test("fails like the path lookup for paths that do not lead to a node", () => {
    const alice = session("alice");
    expect(openDirectory(world, alice, "missing")).toEqual({ ok: false, error: "ENOENT" });
    expect(openDirectory(world, alice, "notes.txt/x")).toEqual({ ok: false, error: "ENOTDIR" });
    expect(openDirectory(world, alice, "/srv/closed/x")).toEqual({ ok: false, error: "EACCES" });
  });

  test("fails with ENOTDIR for a file", () => {
    expect(openDirectory(world, session("alice"), "notes.txt")).toEqual({
      ok: false,
      error: "ENOTDIR",
    });
  });

  test("needs read permission on the directory, except for root", () => {
    const alice = session("alice");
    expect(openDirectory(world, alice, "hidden")).toEqual({ ok: false, error: "EACCES" });
    expect(openDirectory(world, alice, "/srv/closed")).toEqual({ ok: false, error: "EACCES" });
    expect(openDirectory(world, session("root"), "/srv/closed")).toEqual({
      ok: true,
      entries: [dot, dotDot, { name: "inside.txt", kind: "file" }],
    });
  });

  test("by throwing when the session's host is not part of the world", () => {
    const lost: Session = { ...session("alice"), host: "gone" };
    expect(() => openDirectory(world, lost, "/")).toThrow(
      `the session's host "gone" is not part of the world`,
    );
  });
});
