import { describe, expect, test } from "vitest";

import { MAX_ID, toGid, toUid } from "./ids";

describe.each([
  ["toUid", toUid, "uid"],
  ["toGid", toGid, "gid"],
] as const)("%s", (_name, convert, kind) => {
  test.each([0, 1000, MAX_ID])("accepts %d and returns it unchanged", (value) => {
    expect(convert(value)).toBe(value);
  });

  test.each([-1, MAX_ID + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %d with a RangeError",
    (value) => {
      expect(() => convert(value)).toThrow(RangeError);
      expect(() => convert(value)).toThrow(`${kind} must be an integer from 0 to 2^32 - 2`);
    },
  );
});

test("MAX_ID is 2^32 - 2, because 2^32 - 1 means no ID", () => {
  expect(MAX_ID).toBe(4294967294);
});
