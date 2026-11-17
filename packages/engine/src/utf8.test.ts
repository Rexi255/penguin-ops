import { describe, expect, test } from "vitest";

import { decodeUtf8, encodeCodePoint, encodeUtf8, isScalarValue } from "./utf8";

describe("encodeUtf8", () => {
  test("encodes one to four bytes per character", () => {
    expect(encodeUtf8("aä€😀")).toEqual([
      0x61, 0xc3, 0xa4, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80,
    ]);
  });

  test("encodes the empty text as no bytes", () => {
    expect(encodeUtf8("")).toEqual([]);
  });

  test("gives a lone surrogate the three bytes of its code point", () => {
    expect(encodeUtf8("\ud800")).toEqual([0xed, 0xa0, 0x80]);
  });
});

describe("encodeCodePoint", () => {
  test("encodes the limits of each length", () => {
    expect(encodeCodePoint(0x7f)).toEqual([0x7f]);
    expect(encodeCodePoint(0x80)).toEqual([0xc2, 0x80]);
    expect(encodeCodePoint(0x7ff)).toEqual([0xdf, 0xbf]);
    expect(encodeCodePoint(0x800)).toEqual([0xe0, 0xa0, 0x80]);
    expect(encodeCodePoint(0xffff)).toEqual([0xef, 0xbf, 0xbf]);
    expect(encodeCodePoint(0x10000)).toEqual([0xf0, 0x90, 0x80, 0x80]);
    expect(encodeCodePoint(0x10ffff)).toEqual([0xf4, 0x8f, 0xbf, 0xbf]);
  });

  test.each([-1, 0x110000, 1.5])("throws for %d", (value) => {
    expect(() => encodeCodePoint(value)).toThrow(RangeError);
  });
});

describe("isScalarValue", () => {
  test.each([
    [0, true],
    [0xd7ff, true],
    [0xd800, false],
    [0xdfff, false],
    [0xe000, true],
    [0x10ffff, true],
    [0x110000, false],
    [-1, false],
    [2.5, false],
  ])("%d gives %s", (value, expected) => {
    expect(isScalarValue(value)).toBe(expected);
  });
});

describe("decodeUtf8", () => {
  test("decodes valid bytes", () => {
    expect(decodeUtf8([0x61, 0xc3, 0xa4, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80])).toBe("aä€😀");
    expect(decodeUtf8([])).toBe("");
    expect(decodeUtf8([0x00])).toBe("\0");
  });

  test.each([
    ["a lone continuation byte", [0x80]],
    ["a byte that cannot start a character", [0xff]],
    ["a five-byte start", [0xf8, 0x80, 0x80, 0x80, 0x80]],
    ["a missing continuation byte at the end", [0xc3]],
    ["a wrong continuation byte", [0xc3, 0x41]],
    ["an overlong two-byte form", [0xc0, 0x80]],
    ["an overlong three-byte form", [0xe0, 0x80, 0x80]],
    ["a surrogate", [0xed, 0xa0, 0x80]],
    ["a value above U+10FFFF", [0xf4, 0x90, 0x80, 0x80]],
  ])("rejects %s", (_case, bytes) => {
    expect(decodeUtf8(bytes)).toBeUndefined();
  });
});
