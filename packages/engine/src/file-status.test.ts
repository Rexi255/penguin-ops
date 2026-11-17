import { describe, expect, test } from "vitest";

import { fileStatus, fileTypeLetter, modeString } from "./file-status";
import type { DirectoryNode, FileNode, FsNode } from "./fs-node";
import { toGid, toUid } from "./ids";

const attributes = { owner: toUid(1000), group: toGid(1001), mode: 0o644, mtime: 1234 };

function file(content: string): FileNode {
  return { kind: "file", ...attributes, content };
}

function directory(entries: Record<string, FsNode> = {}): DirectoryNode {
  return {
    kind: "directory",
    ...attributes,
    mode: 0o755,
    entries: new Map(Object.entries(entries)),
  };
}

describe("fileStatus", () => {
  test("copies the attributes of the node", () => {
    expect(fileStatus(file("hello\n"))).toEqual({
      kind: "file",
      mode: 0o644,
      links: 1,
      owner: 1000,
      group: 1001,
      size: 6,
      blocks: 8,
      mtime: 1234,
    });
  });

  test("counts the size of a file in UTF-8 bytes", () => {
    expect(fileStatus(file("")).size).toBe(0);
    expect(fileStatus(file("ä")).size).toBe(2);
    expect(fileStatus(file("日本")).size).toBe(6);
    expect(fileStatus(file("🐧")).size).toBe(4);
  });

  test("rounds the blocks of a file up to whole blocks of 4 KiB", () => {
    expect(fileStatus(file("")).blocks).toBe(0);
    expect(fileStatus(file("x")).blocks).toBe(8);
    expect(fileStatus(file("x".repeat(4096))).blocks).toBe(8);
    expect(fileStatus(file("x".repeat(4097))).blocks).toBe(16);
  });

  test("gives a directory one block and a link for each subdirectory", () => {
    expect(fileStatus(directory())).toMatchObject({ kind: "directory", links: 2, size: 4096 });
    const parent = directory({ a: directory(), b: directory(), notes: file("x") });
    expect(fileStatus(parent)).toMatchObject({ links: 4, size: 4096, blocks: 8 });
  });
});

describe("fileTypeLetter", () => {
  test("is - for a file and d for a directory", () => {
    expect(fileTypeLetter("file")).toBe("-");
    expect(fileTypeLetter("directory")).toBe("d");
  });
});

describe("modeString", () => {
  test("writes the type and rwx for owner, group and others", () => {
    expect(modeString("file", 0o644)).toBe("-rw-r--r--");
    expect(modeString("directory", 0o755)).toBe("drwxr-xr-x");
    expect(modeString("file", 0o000)).toBe("----------");
    expect(modeString("file", 0o777)).toBe("-rwxrwxrwx");
    expect(modeString("file", 0o421)).toBe("-r---w---x");
  });

  test("shows setuid and setgid as s, or S without the execute bit", () => {
    expect(modeString("file", 0o4755)).toBe("-rwsr-xr-x");
    expect(modeString("file", 0o4644)).toBe("-rwSr--r--");
    expect(modeString("directory", 0o2775)).toBe("drwxrwsr-x");
    expect(modeString("directory", 0o2765)).toBe("drwxrwSr-x");
  });

  test("shows the sticky bit as t, or T without the execute bit", () => {
    expect(modeString("directory", 0o1777)).toBe("drwxrwxrwt");
    expect(modeString("directory", 0o1776)).toBe("drwxrwxrwT");
    expect(modeString("file", 0o7000)).toBe("---S--S--T");
    expect(modeString("file", 0o7777)).toBe("-rwsrwsrwt");
  });
});
