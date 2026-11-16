import { describe, expect, test } from "vitest";

import { createRandom } from "./random";

const UINT32_RANGE = 2 ** 32;

/** Draws `count` values from `draw`. */
function take(count: number, draw: () => number): number[] {
  return Array.from({ length: count }, draw);
}

describe("createRandom", () => {
  // Reference values from the original Mulberry32 implementation. If these change, every
  // generated world changes, so they must never be updated casually.
  const reference: [number, number[]][] = [
    [0, [1144304738, 1416247, 958946056, 627933444, 2007157716]],
    [1, [2693262067, 11749833, 2265367787, 4213581821, 4159151403]],
    [42, [2581720956, 1925393290, 3661312704, 2876485805, 750819978]],
    [UINT32_RANGE - 1, [3850105811, 813802916, 3073704848, 4054706436, 3630262831]],
  ];

  for (const [seed, expected] of reference) {
    test(`seed ${String(seed)} produces the Mulberry32 reference sequence`, () => {
      const random = createRandom(seed);
      expect(take(5, () => random.nextInt(UINT32_RANGE))).toEqual(expected);
    });

    test(`next() with seed ${String(seed)} scales the reference sequence to [0, 1)`, () => {
      const random = createRandom(seed);
      expect(take(5, () => random.next())).toEqual(expected.map((value) => value / UINT32_RANGE));
    });
  }

  test("the same seed always gives the same sequence", () => {
    const first = createRandom(123456);
    const second = createRandom(123456);
    expect(take(100, () => first.next())).toEqual(take(100, () => second.next()));
  });

  test("different seeds give different sequences", () => {
    const first = createRandom(7);
    const second = createRandom(8);
    expect(take(10, () => first.next())).not.toEqual(take(10, () => second.next()));
  });

  test("generators do not share state", () => {
    const first = createRandom(99);
    const untouched = createRandom(99);
    take(50, () => first.next());
    expect(untouched.nextInt(UINT32_RANGE)).toBe(createRandom(99).nextInt(UINT32_RANGE));
  });

  test("next() stays in [0, 1)", () => {
    const random = createRandom(2024);
    for (const value of take(10_000, () => random.next())) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test.each([0.5, -1, UINT32_RANGE, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the invalid seed %s",
    (seed) => {
      expect(() => createRandom(seed)).toThrow(RangeError);
    },
  );
});

describe("nextInt", () => {
  test("returns integers in [0, bound)", () => {
    const random = createRandom(5);
    for (const bound of [1, 2, 3, 6, 10, 1000]) {
      for (const value of take(1000, () => random.nextInt(bound))) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
      }
    }
  });

  test("bound 1 always returns 0", () => {
    const random = createRandom(11);
    expect(take(20, () => random.nextInt(1))).toEqual(Array.from({ length: 20 }, () => 0));
  });

  test("hits every value of a small range about equally often", () => {
    const random = createRandom(31337);
    const counts = [0, 0, 0, 0, 0, 0];
    for (const value of take(60_000, () => random.nextInt(6))) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(9_500);
      expect(count).toBeLessThan(10_500);
    }
  });

  test("draws again instead of returning a biased value", () => {
    // With this bound, almost half of all 32-bit values fall into the incomplete last block and
    // must be rejected; a modulo without rejection would return them as small numbers.
    const bound = 2 ** 31 + 1;
    const raw = createRandom(77);
    const random = createRandom(77);
    const limit = UINT32_RANGE - (UINT32_RANGE % bound);

    let rejected = 0;
    for (let draw = 0; draw < 200; draw += 1) {
      let value = raw.nextInt(UINT32_RANGE);
      while (value >= limit) {
        rejected += 1;
        value = raw.nextInt(UINT32_RANGE);
      }
      expect(random.nextInt(bound)).toBe(value % bound);
    }
    expect(rejected).toBeGreaterThan(0);
  });

  test.each([0, -3, 2.5, UINT32_RANGE + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the invalid bound %s",
    (bound) => {
      expect(() => createRandom(1).nextInt(bound)).toThrow(RangeError);
    },
  );
});
