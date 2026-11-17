// Game clock (ADR 0008, ADR 0043). The engine never reads the real time: it gets a clock from
// outside. The game clock stands still until its owner (the gameplay package, or a test)
// advances it, so the same commands always give the same file times on every machine.

/**
 * A read-only view of the game time. Engine functions that need the time (for example to set a
 * file's mtime) take this view, so they can read the time but never change it.
 */
export interface Clock {
  /** The current game time in whole milliseconds since 1970-01-01T00:00:00Z. */
  now(): number;
}

/** A clock whose owner moves the game time forward. */
export interface GameClock extends Clock {
  /**
   * Moves the game time forward by `milliseconds`, a non-negative whole number. Throws a
   * RangeError for any other value, or if the new time would no longer be a safe integer. The
   * time never moves backwards.
   */
  advance(milliseconds: number): void;
}

/**
 * Creates a game clock that starts at `start`, a time in whole milliseconds since
 * 1970-01-01T00:00:00Z (a safe integer; negative values are times before 1970). Throws a
 * RangeError for any other value.
 */
export function createGameClock(start: number): GameClock {
  if (!Number.isSafeInteger(start)) {
    throw new RangeError(`start must be a safe integer, got ${String(start)}`);
  }
  let time = start;
  return {
    now: () => time,
    advance(milliseconds: number): void {
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
        throw new RangeError(
          `milliseconds must be a non-negative safe integer, got ${String(milliseconds)}`,
        );
      }
      const next = time + milliseconds;
      if (!Number.isSafeInteger(next)) {
        throw new RangeError(`advancing by ${String(milliseconds)} ms leaves the safe time range`);
      }
      time = next;
    },
  };
}
