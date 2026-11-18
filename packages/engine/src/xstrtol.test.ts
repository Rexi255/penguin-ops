import { describe, expect, test } from "vitest";

import { UINTMAX_MAX, xnumtoumax, xstrtoumax } from "./xstrtol";

/** The suffixes of `head` and `tail`. */
const COUNT = "bkKmMGTPEZYRQ0";

describe("xstrtoumax: numbers", () => {
  test.each([
    ["0", 0n],
    ["42", 42n],
    ["007", 7n],
    ["+5", 5n],
    ["  \t5", 5n],
    [" +5", 5n],
    ["18446744073709551615", UINTMAX_MAX],
  ])("%j is %s", (text, value) => {
    expect(xstrtoumax(text, COUNT)).toEqual({ status: "ok", value, digitsOverflow: false });
  });

  test("a number too large for uintmax_t saturates with an overflow of the digits", () => {
    expect(xstrtoumax("18446744073709551616", COUNT)).toEqual({
      status: "overflow",
      value: UINTMAX_MAX,
      digitsOverflow: true,
    });
  });

  test.each(["", " ", "-5", " -5", "abc", "+", "+k", " k", "--5"])("%j is invalid", (text) => {
    expect(xstrtoumax(text, COUNT)).toEqual({
      status: "invalid",
      value: 0n,
      digitsOverflow: false,
    });
  });
});

describe("xstrtoumax: suffixes", () => {
  test.each([
    ["1b", 512n],
    ["2k", 2048n],
    ["2K", 2048n],
    ["2KiB", 2048n],
    ["2kB", 2000n],
    ["2KD", 2000n],
    ["1m", 1024n ** 2n],
    ["1M", 1024n ** 2n],
    ["1MB", 1000n ** 2n],
    ["1G", 1024n ** 3n],
    ["1T", 1024n ** 4n],
    ["1P", 1024n ** 5n],
    ["1E", 1024n ** 6n],
    ["1GB", 1000n ** 3n],
    ["k", 1024n],
    ["MiB", 1024n ** 2n],
  ])("%j is %s", (text, value) => {
    expect(xstrtoumax(text, COUNT)).toEqual({ status: "ok", value, digitsOverflow: false });
  });

  test.each([
    ["1Z", 1024n ** 7n],
    ["1Y", 1024n ** 8n],
    ["1R", 1024n ** 9n],
    ["1Q", 1024n ** 10n],
  ])("%j saturates like the other powers that exceed 64 bits", (text) => {
    expect(xstrtoumax(text, COUNT)).toEqual({
      status: "overflow",
      value: UINTMAX_MAX,
      digitsOverflow: false,
    });
  });

  test("a scale that overflows saturates without an overflow of the digits", () => {
    expect(xstrtoumax("36028797018963968b", COUNT)).toEqual({
      status: "overflow",
      value: UINTMAX_MAX,
      digitsOverflow: false,
    });
  });

  test.each([
    ["5x", 5n],
    ["5 ", 5n],
    ["5Ki", 5120n],
    ["5kBx", 5000n],
    ["5g", 5n],
    ["5B", 5n],
  ])("%j has an invalid suffix after the value %s", (text, value) => {
    expect(xstrtoumax(text, COUNT)).toEqual({
      status: "invalid-suffix",
      value,
      digitsOverflow: false,
    });
  });

  test("an invalid suffix after too many digits keeps both problems", () => {
    expect(xstrtoumax("99999999999999999999x", COUNT)).toEqual({
      status: "invalid-suffix-overflow",
      value: UINTMAX_MAX,
      digitsOverflow: true,
    });
  });

  test("without the flag 0, a second suffix is not read", () => {
    expect(xstrtoumax("2kB", "k")).toEqual({
      status: "invalid-suffix",
      value: 2048n,
      digitsOverflow: false,
    });
  });

  test.each([
    ["2B", 2048n],
    ["2c", 2n],
    ["2w", 4n],
    ["2g", 2n * 1024n ** 3n],
    ["2t", 2n * 1024n ** 4n],
  ])("%j uses the suffix of xstrtol.c when the caller allows it", (text, value) => {
    expect(xstrtoumax(text, "BcwgtZ")).toEqual({ status: "ok", value, digitsOverflow: false });
  });

  test("an allowed character without a meaning is an invalid suffix", () => {
    expect(xstrtoumax("5x", "x")).toEqual({
      status: "invalid-suffix",
      value: 5n,
      digitsOverflow: false,
    });
  });
});

describe("xnumtoumax", () => {
  test("returns valid values", () => {
    expect(xnumtoumax("5k", COUNT)).toBe(5120n);
  });

  test("returns UINTMAX_MAX for values that are too large, without an error", () => {
    expect(xnumtoumax("99999999999999999999", COUNT)).toBe(UINTMAX_MAX);
    expect(xnumtoumax("1Q", COUNT)).toBe(UINTMAX_MAX);
  });

  test.each(["", "abc", "-1", "5x", "99999999999999999999x"])("rejects %j", (text) => {
    expect(xnumtoumax(text, COUNT)).toBeUndefined();
  });
});
