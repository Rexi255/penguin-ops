import { describe, expect, test } from "vitest";

import { utcCalendarTime } from "./calendar";

describe("utcCalendarTime", () => {
  test("starts at the epoch", () => {
    expect(utcCalendarTime(0)).toEqual({
      year: 1970,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  test("agrees with Date.UTC on dates around the game's time", () => {
    for (const [year, month, day, hour, minute, second] of [
      [2026, 11, 17, 22, 46, 5],
      [2026, 3, 2, 8, 0, 0],
      [2024, 2, 29, 23, 59, 59],
      [2000, 2, 29, 12, 30, 0],
      [2100, 3, 1, 0, 0, 0],
      [1999, 12, 31, 23, 59, 59],
    ] as const) {
      const time = Date.UTC(year, month - 1, day, hour, minute, second);
      expect(utcCalendarTime(time)).toEqual({ year, month, day, hour, minute, second });
    }
  });

  test("drops the milliseconds", () => {
    expect(utcCalendarTime(Date.UTC(2026, 0, 1, 0, 0, 0) + 999)).toMatchObject({
      year: 2026,
      second: 0,
    });
  });

  test("counts back before 1970", () => {
    expect(utcCalendarTime(-1)).toEqual({
      year: 1969,
      month: 12,
      day: 31,
      hour: 23,
      minute: 59,
      second: 59,
    });
    const time = Date.UTC(1900, 1, 28, 6, 7, 8);
    expect(utcCalendarTime(time)).toEqual({
      year: 1900,
      month: 2,
      day: 28,
      hour: 6,
      minute: 7,
      second: 8,
    });
  });

  test("works for every day of a leap year and the years around it", () => {
    let time = Date.UTC(2023, 0, 1);
    const end = Date.UTC(2026, 0, 1);
    while (time < end) {
      const date = new Date(time);
      expect(utcCalendarTime(time)).toEqual({
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: 0,
        minute: 0,
        second: 0,
      });
      time += 86_400_000;
    }
  });

  test("works for the largest and smallest safe integers, beyond the range of Date", () => {
    expect(utcCalendarTime(Number.MAX_SAFE_INTEGER)).toEqual({
      year: 287_396,
      month: 10,
      day: 12,
      hour: 8,
      minute: 59,
      second: 0,
    });
    expect(utcCalendarTime(Number.MIN_SAFE_INTEGER)).toEqual({
      year: -283_457,
      month: 3,
      day: 21,
      hour: 15,
      minute: 0,
      second: 59,
    });
  });

  test("rejects times that are not safe integers", () => {
    for (const time of [0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
      expect(() => utcCalendarTime(time)).toThrow(RangeError);
    }
  });
});
