// Timers of the main process, replaceable in tests, so that a test runs a timeout by hand instead
// of waiting for it.

/** Starts and stops timers. */
export interface Timers {
  readonly setTimeout: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimeout: (timer: unknown) => void;
}

/** The real timers of Node.js. */
export const REAL_TIMERS: Timers = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (timer) => {
    clearTimeout(timer as ReturnType<typeof setTimeout>);
  },
};
