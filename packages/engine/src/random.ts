// Seeded random number generator (ADR 0008). The engine never calls Math.random(): everything
// random in the simulated world comes from a generator created from a seed, so the same seed
// gives the same world on every machine and in every test run.

/** A deterministic source of random numbers. Each call advances the generator. */
export interface RandomGenerator {
  /** Returns the next number in the range [0, 1). */
  next(): number;
  /** Returns the next integer in the range [0, bound). `bound` is an integer from 1 to 2^32. */
  nextInt(bound: number): number;
}

const UINT32_RANGE = 2 ** 32;

/**
 * Creates a generator from `seed`, an integer from 0 to 2^32 - 1.
 *
 * The algorithm is Mulberry32 by Tommy Ettinger (CC0-1.0, see THIRD-PARTY-LICENSES.md): one
 * 32-bit state word and a period of 2^32. It is fast and good enough for game data, but not for
 * anything security-related.
 */
export function createRandom(seed: number): RandomGenerator {
  if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
    throw new RangeError(`seed must be an integer from 0 to 2^32 - 1, got ${String(seed)}`);
  }
  let state = seed;

  function nextUint32(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return (mixed ^ (mixed >>> 14)) >>> 0;
  }

  return {
    next(): number {
      return nextUint32() / UINT32_RANGE;
    },
    nextInt(bound: number): number {
      if (!Number.isInteger(bound) || bound < 1 || bound > UINT32_RANGE) {
        throw new RangeError(`bound must be an integer from 1 to 2^32, got ${String(bound)}`);
      }
      // Rejection sampling: a plain `value % bound` would favour small results whenever 2^32 is
      // not a multiple of `bound`. Values from the incomplete last block are drawn again.
      const limit = UINT32_RANGE - (UINT32_RANGE % bound);
      for (;;) {
        const value = nextUint32();
        if (value < limit) {
          return value % bound;
        }
      }
    },
  };
}
