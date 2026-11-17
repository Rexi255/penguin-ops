// Calendar dates of game times (ADR 0055). The simulated hosts run on UTC, like a freshly
// installed Debian server image, so a time in milliseconds since the epoch turns into a date
// and a time of day without time zones or daylight saving time. The conversion is plain
// arithmetic on the proleptic Gregorian calendar, so it works for every safe integer, also far
// outside the range of the platform's `Date`.

/** A point in time as a UTC calendar date and time of day. */
export interface CalendarTime {
  /** The year; 0 is 1 BC and negative years are earlier, as in ISO 8601. */
  readonly year: number;
  /** The month from 1 (January) to 12 (December). */
  readonly month: number;
  /** The day of the month from 1 to 31. */
  readonly day: number;
  /** The hour from 0 to 23. */
  readonly hour: number;
  /** The minute from 0 to 59. */
  readonly minute: number;
  /** The second from 0 to 59; UTC as computers count it has no leap seconds. */
  readonly second: number;
}

const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_DAY = 86_400_000;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

/** Days from 0000-03-01, the start of the first 400-year era, to 1970-01-01. */
const EPOCH_OFFSET_DAYS = 719_468;
const DAYS_PER_ERA = 146_097;
const YEARS_PER_ERA = 400;

/**
 * Returns the UTC calendar date and time of day of `time`, a safe integer of milliseconds since
 * 1970-01-01T00:00:00Z. Times before 1970 count back, so -1 is 1969-12-31T23:59:59.999Z (the
 * second 59). Throws a RangeError for any other value.
 */
export function utcCalendarTime(time: number): CalendarTime {
  if (!Number.isSafeInteger(time)) {
    throw new RangeError(`time must be a safe integer, got ${String(time)}`);
  }
  const days = Math.floor(time / MILLISECONDS_PER_DAY);
  const secondOfDay = Math.floor((time - days * MILLISECONDS_PER_DAY) / MILLISECONDS_PER_SECOND);
  return {
    ...civilFromDays(days),
    hour: Math.floor(secondOfDay / SECONDS_PER_HOUR),
    minute: Math.floor((secondOfDay % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    second: secondOfDay % SECONDS_PER_MINUTE,
  };
}

/**
 * The date `days` days after 1970-01-01, with Howard Hinnant's `civil_from_days`: the calendar
 * is counted in 400-year eras that start on 1 March, so that the leap day is the last day of
 * its year and every era has the same number of days.
 */
function civilFromDays(days: number): { year: number; month: number; day: number } {
  const shifted = days + EPOCH_OFFSET_DAYS;
  const era = Math.floor(shifted / DAYS_PER_ERA);
  const dayOfEra = shifted - era * DAYS_PER_ERA;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  // Months counted from March (0) to February (11).
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * YEARS_PER_ERA + (month <= 2 ? 1 : 0);
  return { year, month, day };
}
