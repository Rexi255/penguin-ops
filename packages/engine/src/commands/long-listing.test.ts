import { describe, expect, test } from "vitest";

import { type FileStatus } from "../file-status";
import { toGid, toUid } from "../ids";
import type { Host } from "../world";
import { formatLongListing, type LongContext, totalLine } from "./long-listing";

const host: Host = {
  name: "ws01",
  root: {
    kind: "directory",
    owner: toUid(0),
    group: toGid(0),
    mode: 0o755,
    mtime: 0,
    entries: new Map(),
  },
  users: [],
  groups: [],
};

const context: LongContext = {
  host,
  style: { owner: true, group: true, numericIds: false },
  now: Date.UTC(2026, 10, 17, 22, 46, 0),
};

function status(mtime: number): FileStatus {
  return {
    kind: "file",
    mode: 0o644,
    links: 1,
    owner: toUid(1000),
    group: toGid(1000),
    size: 0,
    blocks: 0,
    mtime,
  };
}

function line(mtime: number): string {
  const file = status(mtime);
  return formatLongListing([{ text: "f", kind: "file", status: file }], [file], context);
}

describe("formatLongListing", () => {
  test("@differential writes years with at least four digits and a sign before year 0", () => {
    expect(line(Date.UTC(10_000, 0, 1))).toBe("-rw-r--r-- 1 1000 1000 0 Jan  1  10000 f\n");
    expect(line(Date.UTC(999, 5, 30))).toBe("-rw-r--r-- 1 1000 1000 0 Jun 30  0999 f\n");
    expect(line(Date.UTC(-1, 0, 1))).toBe("-rw-r--r-- 1 1000 1000 0 Jan  1  -0001 f\n");
  });

  test("measures the columns over the measured files only", () => {
    const small = status(context.now);
    const wide = { ...status(context.now), links: 100, size: 12_345 };
    expect(
      formatLongListing([{ text: "f", kind: "file", status: small }], [small, wide], context),
    ).toBe("-rw-r--r--   1 1000 1000     0 Nov 17 22:46 f\n");
  });
});

describe("totalLine", () => {
  test("adds the blocks of the files it could stat in KiB", () => {
    expect(totalLine([])).toBe("total 0\n");
    expect(totalLine([undefined, { ...status(0), blocks: 8 }, { ...status(0), blocks: 16 }])).toBe(
      "total 12\n",
    );
  });

  test("rounds half a KiB up", () => {
    expect(totalLine([{ ...status(0), blocks: 1 }])).toBe("total 1\n");
  });
});
