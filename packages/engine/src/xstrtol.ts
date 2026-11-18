// Numbers in command arguments as gnulib reads them (ADR 0059): `xstrtoumax` from
// `lib/xstrtol.c` and `xnumtoumax` from `lib/xdectoint.c`, which the coreutils use for counts
// such as `head -n 5k`. A number is decimal and may have a multiplier suffix (`b` is 512, `K`
// and `KiB` are 1024, `kB` is 1000, and so on up to `Q`); a value too large for `uintmax_t`
// saturates at its maximum. Values are bigints, because the maximum is 2^64 - 1.

/** The largest value of `uintmax_t` on Debian 13 (64 bits). */
export const UINTMAX_MAX = 2n ** 64n - 1n;

/**
 * How `xstrtoumax` ended, like gnulib's `strtol_error`:
 *
 * - `ok`: a number, with a valid suffix if any.
 * - `overflow`: a number too large for `uintmax_t`; the value is `UINTMAX_MAX`.
 * - `invalid`: no number at all, or a minus sign.
 * - `invalid-suffix`: a number followed by characters that are not a valid suffix.
 * - `invalid-suffix-overflow`: both of the last two problems.
 */
export type XstrtolStatus =
  "ok" | "overflow" | "invalid" | "invalid-suffix" | "invalid-suffix-overflow";

/** The result of `xstrtoumax`. */
export interface XstrtolResult {
  readonly status: XstrtolStatus;
  /** The value read so far; 0 for `invalid`. */
  readonly value: bigint;
  /**
   * Whether the digits themselves were too large, so that `strtoumax` set `errno` to `ERANGE`
   * ("Numerical result out of range"). An overflow of the suffix alone leaves `errno` at 0.
   */
  readonly digitsOverflow: boolean;
}

/** The characters that C's `isspace` accepts in the C and UTF-8 locales. */
const C_SPACE = new Set([" ", "\t", "\n", "\v", "\f", "\r"]);

/** Suffixes that may take a second suffix (`iB` or `B`/`D`) when `0` is among the valid ones. */
const POWER_SUFFIXES = new Set([
  "E",
  "G",
  "g",
  "k",
  "K",
  "M",
  "m",
  "P",
  "Q",
  "R",
  "T",
  "t",
  "Y",
  "Z",
]);

/** The powers of the suffixes that scale by a power of 1024 (or 1000). */
const SUFFIX_POWERS: Readonly<Record<string, number>> = {
  k: 1,
  K: 1,
  M: 2,
  m: 2,
  G: 3,
  g: 3,
  T: 4,
  t: 4,
  P: 5,
  E: 6,
  Z: 7,
  Y: 8,
  R: 9,
  Q: 10,
};

/** The suffixes that scale by a fixed factor. */
const SUFFIX_FACTORS: Readonly<Record<string, bigint>> = { b: 512n, B: 1024n, c: 1n, w: 2n };

/**
 * Reads `text` like gnulib's `xstrtoumax (text, &end, 10, &value, validSuffixes)`:
 *
 * - Leading white space is skipped; a minus sign after it is `invalid`. A plus sign is allowed.
 * - Decimal digits give the value; too many give `overflow` with `UINTMAX_MAX`. Without digits,
 *   `text` must start with a valid suffix, which then stands for the number 1 (`k` is 1024).
 * - After the digits, a character that is not in `validSuffixes` gives `invalid-suffix`. A
 *   valid one multiplies the value (with `0` among the valid suffixes, `KiB` is 1024 and `kB`
 *   1000); anything after the suffix gives `invalid-suffix`.
 */
export function xstrtoumax(text: string, validSuffixes: string): XstrtolResult {
  const characters = Array.from(text);
  let index = 0;
  while (C_SPACE.has(characters[index] ?? "")) {
    index++;
  }
  if (characters[index] === "-") {
    return { status: "invalid", value: 0n, digitsOverflow: false };
  }
  if (characters[index] === "+") {
    index++;
  }
  const digitsStart = index;
  let value = 0n;
  while (isDigit(characters[index])) {
    value = value * 10n + BigInt(characters[index] ?? "0");
    index++;
  }
  let overflow = false;
  if (index === digitsStart) {
    // strtoumax converted nothing, so the end pointer is the start of the text.
    const first = characters[0];
    if (first === undefined || !validSuffixes.includes(first)) {
      return { status: "invalid", value: 0n, digitsOverflow: false };
    }
    index = 0;
    value = 1n;
  } else if (value > UINTMAX_MAX) {
    value = UINTMAX_MAX;
    overflow = true;
  }
  const digitsOverflow = overflow;
  const suffix = characters[index];
  if (suffix === undefined) {
    return result(value, overflow, false, digitsOverflow);
  }
  if (!validSuffixes.includes(suffix)) {
    return result(value, overflow, true, digitsOverflow);
  }
  let base = 1024n;
  let length = 1;
  if (POWER_SUFFIXES.has(suffix) && validSuffixes.includes("0")) {
    const second = characters[index + 1];
    if (second === "i" && characters[index + 2] === "B") {
      length += 2;
    } else if (second === "B" || second === "D") {
      base = 1000n;
      length++;
    }
  }
  const power = SUFFIX_POWERS[suffix];
  const factor = SUFFIX_FACTORS[suffix];
  let scaled: Scaled;
  if (power !== undefined) {
    scaled = scaleByPower(value, base, power);
  } else if (factor !== undefined) {
    scaled = scale(value, factor);
  } else {
    // The `default` case of xstrtol.c: a character that the caller allows but that has no
    // meaning as a multiplier.
    return result(value, overflow, true, digitsOverflow);
  }
  const rest = characters.length > index + length;
  return result(scaled.value, overflow || scaled.overflow, rest, digitsOverflow);
}

/**
 * Reads `text` like gnulib's `xnumtoumax (text, 10, 0, UINTMAX_MAX, validSuffixes, …,
 * XTOINT_MAX_QUIET)`: the value of `xstrtoumax`, `UINTMAX_MAX` for a number that is too large,
 * and `undefined` for every other error, after which the command writes `MESSAGE: ‘TEXT’`.
 */
export function xnumtoumax(text: string, validSuffixes: string): bigint | undefined {
  const read = xstrtoumax(text, validSuffixes);
  switch (read.status) {
    case "ok":
    case "overflow":
      return read.value;
    case "invalid":
    case "invalid-suffix":
    case "invalid-suffix-overflow":
      return undefined;
  }
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

interface Scaled {
  readonly value: bigint;
  readonly overflow: boolean;
}

/** gnulib's `bkm_scale`: `value * factor`, or `UINTMAX_MAX` with an overflow. */
function scale(value: bigint, factor: bigint): Scaled {
  const scaled = value * factor;
  return scaled > UINTMAX_MAX
    ? { value: UINTMAX_MAX, overflow: true }
    : { value: scaled, overflow: false };
}

/** gnulib's `bkm_scale_by_power`: `scale` by `base` `power` times; an overflow stays. */
function scaleByPower(value: bigint, base: bigint, power: number): Scaled {
  let current: Scaled = { value, overflow: false };
  for (let step = 0; step < power; step++) {
    const next = scale(current.value, base);
    current = { value: next.value, overflow: current.overflow || next.overflow };
  }
  return current;
}

function result(
  value: bigint,
  overflow: boolean,
  invalidSuffix: boolean,
  digitsOverflow: boolean,
): XstrtolResult {
  let status: XstrtolStatus = "ok";
  if (invalidSuffix) {
    status = overflow ? "invalid-suffix-overflow" : "invalid-suffix";
  } else if (overflow) {
    status = "overflow";
  }
  return { status, value, digitsOverflow };
}
