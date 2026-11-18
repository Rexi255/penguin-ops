import { describe, expect, test } from "vitest";

import { legalNumber, toCInt } from "./bash-number";

describe("legalNumber", () => {
  test.each([
    ["0", 0n],
    ["42", 42n],
    ["+7", 7n],
    ["-7", -7n],
    ["007", 7n],
    [" \t\n\v\f\r12", 12n],
    ["12 \t", 12n],
    ["9223372036854775807", 9223372036854775807n],
    ["-9223372036854775808", -9223372036854775808n],
  ])("reads %j as %s", (text, value) => {
    expect(legalNumber(text)).toBe(value);
  });

  test.each([
    ["an empty text", ""],
    ["only white space", "  "],
    ["only a sign", "-"],
    ["a sign after white space and nothing else", " +"],
    ["letters", "abc"],
    ["digits followed by letters", "12abc"],
    ["a line break after the digits", "12\n"],
    ["a decimal point", "1.5"],
    ["a space between sign and digits", "- 1"],
    ["two signs", "--1"],
    ["a hexadecimal number", "0x10"],
    ["a number above the 64-bit range", "9223372036854775808"],
    ["a number below the 64-bit range", "-9223372036854775809"],
    ["non-ASCII digits", "١٢"],
  ])("rejects %s", (_case, text) => {
    expect(legalNumber(text)).toBeUndefined();
  });
});

describe("toCInt", () => {
  test("keeps numbers that fit into 32 bits", () => {
    expect(toCInt(1000n)).toBe(1000);
    expect(toCInt(-1n)).toBe(-1);
    expect(toCInt(2147483647n)).toBe(2147483647);
  });

  test("keeps only the lowest 32 bits of larger numbers", () => {
    expect(toCInt(2147483648n)).toBe(-2147483648);
    expect(toCInt(4294967296n)).toBe(0);
    expect(toCInt(4294967297n)).toBe(1);
  });
});
