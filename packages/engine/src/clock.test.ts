import { describe, expect, test } from "vitest";

import { type Clock, createGameClock } from "./clock";

// 2026-03-02T08:00:00Z, a Monday morning.
const MONDAY = Date.UTC(2026, 2, 2, 8, 0, 0);

describe("createGameClock", () => {
  test("starts at the given time", () => {
    expect(createGameClock(MONDAY).now()).toBe(MONDAY);
  });

  test("stands still until it is advanced", () => {
    const clock = createGameClock(MONDAY);
    expect([clock.now(), clock.now(), clock.now()]).toEqual([MONDAY, MONDAY, MONDAY]);
  });

  test("advance moves the time forward by the given milliseconds", () => {
    const clock = createGameClock(MONDAY);
    clock.advance(1500);
    expect(clock.now()).toBe(MONDAY + 1500);
    clock.advance(60_000);
    expect(clock.now()).toBe(MONDAY + 61_500);
  });

  test("advance by 0 keeps the time", () => {
    const clock = createGameClock(MONDAY);
    clock.advance(0);
    expect(clock.now()).toBe(MONDAY);
  });

  test("accepts the epoch and times before 1970", () => {
    expect(createGameClock(0).now()).toBe(0);
    expect(createGameClock(-86_400_000).now()).toBe(-86_400_000);
  });

  test("two clocks are independent", () => {
    const first = createGameClock(MONDAY);
    const second = createGameClock(MONDAY);
    first.advance(1000);
    expect(second.now()).toBe(MONDAY);
  });

  test("a clock passed on as a read-only Clock still shows the advanced time", () => {
    const clock = createGameClock(MONDAY);
    const view: Clock = clock;
    clock.advance(42);
    expect(view.now()).toBe(MONDAY + 42);
  });

  test.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the start time %s",
    (start) => {
      expect(() => createGameClock(start)).toThrow(RangeError);
      expect(() => createGameClock(start)).toThrow("start must be a safe integer");
    },
  );

  test.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "advance rejects %s and keeps the time",
    (milliseconds) => {
      const clock = createGameClock(MONDAY);
      expect(() => {
        clock.advance(milliseconds);
      }).toThrow("milliseconds must be a non-negative safe integer");
      expect(clock.now()).toBe(MONDAY);
    },
  );

  test("advance rejects a step that leaves the safe time range and keeps the time", () => {
    const clock = createGameClock(Number.MAX_SAFE_INTEGER - 10);
    expect(() => {
      clock.advance(11);
    }).toThrow(RangeError);
    expect(clock.now()).toBe(Number.MAX_SAFE_INTEGER - 10);
    clock.advance(10);
    expect(clock.now()).toBe(Number.MAX_SAFE_INTEGER);
  });
});
