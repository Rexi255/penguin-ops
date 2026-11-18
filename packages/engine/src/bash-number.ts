// Whole numbers as bash reads them (ADR 0057): bash 5.2's `legal_number` from `general.c`, which
// builtins such as `history` use for their numeric arguments and which reads the value of
// `HISTSIZE`.

/** The range of C's `intmax_t` on Linux: a signed 64-bit integer. */
const INTMAX_MIN = -(2n ** 63n);
const INTMAX_MAX = 2n ** 63n - 1n;

/**
 * Returns the number that `text` holds, or `undefined` if it is not one, like bash's
 * `legal_number`: `strtoimax` in base 10 skips leading white space (space, tab, line break,
 * vertical tab, form feed, carriage return) and takes an optional sign and at least one digit;
 * after the digits only spaces and tabs may follow. A number outside the 64-bit range is not a
 * number (`strtoimax` reports `ERANGE`).
 */
export function legalNumber(text: string): bigint | undefined {
  const match = /^[ \t\n\v\f\r]*([+-]?)(\d+)[ \t]*$/u.exec(text);
  if (match === null) {
    return undefined;
  }
  const [, sign, digits] = match;
  const magnitude = BigInt(digits ?? "");
  const value = sign === "-" ? -magnitude : magnitude;
  return value < INTMAX_MIN || value > INTMAX_MAX ? undefined : value;
}

/** The value of a 64-bit number assigned to a C `int`, which keeps its lowest 32 bits. */
export function toCInt(value: bigint): number {
  return Number(BigInt.asIntN(32, value));
}
