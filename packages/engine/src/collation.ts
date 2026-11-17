// Sort order of names (ADR 0008, ADR 0046). Debian 13 sorts with the collation of the default
// English locale (en_US.UTF-8 of glibc), not by bytes: glob results, `ls` and `sort` all use
// it. glibc's collation follows ISO 14651; this module approximates it in four levels, which
// matches glibc for the names that occur in the game.

const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
const COMBINING_MARKS = /\p{M}/gu;

/**
 * Compares two names like `strcoll` in Debian's en_US.UTF-8 locale and returns a negative
 * number, zero or a positive number, for use with `Array.prototype.sort`. The levels:
 *
 * 1. Only letters and digits count; punctuation, spaces and symbols are skipped. Letters are
 *    compared without case and without accents; digits come before letters (`.bashrc` sorts
 *    between `a` and `c`, `B` between `a` and `c`).
 * 2. On a tie, accents decide: the letter without an accent comes first.
 * 3. On a tie, case decides: the lower-case letter comes first (`a` before `A`).
 * 4. On a tie, the whole names decide by code point, so that different names never compare
 *    equal. glibc compares the skipped characters in a more detailed way here.
 */
export function compareNames(a: string, b: string): number {
  const lettersA = lettersAndDigits(a);
  const lettersB = lettersAndDigits(b);
  return (
    compareCodePoints(lettersA.map(baseLetter), lettersB.map(baseLetter)) ||
    compareCodePoints(lettersA.map(lowerCase), lettersB.map(lowerCase)) ||
    compareCase(lettersA, lettersB) ||
    compareCodePoints(Array.from(a), Array.from(b))
  );
}

function lettersAndDigits(name: string): readonly string[] {
  return Array.from(name).filter((c) => LETTER_OR_DIGIT.test(c));
}

/** The letter in lower case without accents: "Ä" gives "a". */
function baseLetter(c: string): string {
  return c.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

function lowerCase(c: string): string {
  return c.toLowerCase();
}

/** Compares two lists of strings element by element by code point; a shorter prefix first. */
function compareCodePoints(a: readonly string[], b: readonly string[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? "";
    const y = b[i] ?? "";
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return a.length - b.length;
}

/**
 * Compares letters that are equal without case: at the first position where they differ, the
 * lower-case letter comes first.
 */
function compareCase(a: readonly string[], b: readonly string[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? "";
    const y = b[i] ?? "";
    if (x !== y) {
      return x === x.toLowerCase() ? -1 : 1;
    }
  }
  return 0;
}
