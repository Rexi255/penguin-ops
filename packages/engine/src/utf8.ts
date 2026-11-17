// UTF-8 bytes (ADR 0053). The game's files and terminal hold text, but some commands work on
// bytes: `echo -e '\xc3\xa4'` writes two bytes that together are the character "ä". These
// functions convert between text and UTF-8 bytes without the platform's `TextEncoder`, which is
// not part of the language the engine may use.

/** The highest Unicode code point. */
const MAX_CODE_POINT = 0x10ffff;

/**
 * Returns the UTF-8 bytes of `text`. A lone surrogate, which a JavaScript string can hold but
 * typed text never does, gets the three bytes of its code point, which `decodeUtf8` rejects.
 */
export function encodeUtf8(text: string): number[] {
  const bytes: number[] = [];
  for (const character of text) {
    bytes.push(...encodeCodePoint(character.codePointAt(0) ?? 0));
  }
  return bytes;
}

/**
 * Returns the UTF-8 bytes of `codePoint`; surrogates get the three bytes of their code point.
 * Throws a RangeError for values outside 0 to 0x10FFFF.
 */
export function encodeCodePoint(codePoint: number): number[] {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) {
    throw new RangeError(`${String(codePoint)} is not a Unicode code point`);
  }
  if (codePoint < 0x80) {
    return [codePoint];
  }
  if (codePoint < 0x800) {
    return [0xc0 | (codePoint >> 6), continuation(codePoint)];
  }
  if (codePoint < 0x10000) {
    return [0xe0 | (codePoint >> 12), continuation(codePoint >> 6), continuation(codePoint)];
  }
  return [
    0xf0 | (codePoint >> 18),
    continuation(codePoint >> 12),
    continuation(codePoint >> 6),
    continuation(codePoint),
  ];
}

/** Returns whether `codePoint` is a Unicode scalar value: 0 to 0x10FFFF without surrogates. */
export function isScalarValue(codePoint: number): boolean {
  return (
    Number.isInteger(codePoint) &&
    codePoint >= 0 &&
    codePoint <= MAX_CODE_POINT &&
    (codePoint < 0xd800 || codePoint > 0xdfff)
  );
}

/**
 * Returns the text of the UTF-8 `bytes`, or `undefined` if they are not valid UTF-8: a byte that
 * cannot start a character, a missing or wrong continuation byte, an overlong form, a surrogate
 * or a value above U+10FFFF.
 */
export function decodeUtf8(bytes: readonly number[]): string | undefined {
  let text = "";
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index] ?? 0;
    const length = sequenceLength(first);
    if (length === undefined || index + length > bytes.length) {
      return undefined;
    }
    let codePoint = length === 1 ? first : first & (0xff >> (length + 1));
    for (let offset = 1; offset < length; offset++) {
      const next = bytes[index + offset] ?? 0;
      if ((next & 0xc0) !== 0x80) {
        return undefined;
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (!isScalarValue(codePoint) || encodeCodePoint(codePoint).length !== length) {
      return undefined;
    }
    text += String.fromCodePoint(codePoint);
    index += length;
  }
  return text;
}

/** The number of bytes of a character that starts with `first`, or `undefined` if none can. */
function sequenceLength(first: number): number | undefined {
  if (first < 0x80) {
    return 1;
  }
  if (first >= 0xc0 && first < 0xe0) {
    return 2;
  }
  if (first >= 0xe0 && first < 0xf0) {
    return 3;
  }
  if (first >= 0xf0 && first < 0xf8) {
    return 4;
  }
  return undefined;
}

/** A continuation byte with the lowest six bits of `value`. */
function continuation(value: number): number {
  return 0x80 | (value & 0x3f);
}
