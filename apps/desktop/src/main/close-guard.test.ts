import { describe, expect, test, vi } from "vitest";

import { CLOSE_TIMEOUT, guardClose, type GuardedWindow, type GuardTimers } from "./close-guard";

/** A window whose events the test fires, and timers the test runs by hand. */
function setup() {
  let closeListener: ((prevent: () => void) => void) | undefined;
  const readyListeners: (() => void)[] = [];
  const timeouts: { callback: () => void; milliseconds: number; cleared: boolean }[] = [];
  const window = {
    onClose: (listener: (prevent: () => void) => void) => {
      closeListener = listener;
    },
    requestClose: vi.fn(),
    onceReady: (listener: () => void) => {
      readyListeners.push(listener);
    },
    close: vi.fn(),
  } satisfies GuardedWindow;
  const timers: GuardTimers = {
    setTimeout: (callback, milliseconds) => {
      const timeout = { callback, milliseconds, cleared: false };
      timeouts.push(timeout);
      return timeout;
    },
    clearTimeout: (timer) => {
      const timeout = timeouts.find((candidate) => candidate === timer);
      if (timeout !== undefined) {
        timeout.cleared = true;
      }
    },
  };
  guardClose(window, timers);
  /** Fires the close event and returns whether the guard kept the window open. */
  const tryClose = () => {
    let prevented = false;
    closeListener?.(() => {
      prevented = true;
    });
    return prevented;
  };
  const ready = () => {
    for (const listener of readyListeners.splice(0)) {
      listener();
    }
  };
  return { window, timeouts, tryClose, ready };
}

describe("guardClose", () => {
  test("holds the first close back and asks the renderer to get ready", () => {
    const { window, tryClose, timeouts } = setup();
    expect(tryClose()).toBe(true);
    expect(window.requestClose).toHaveBeenCalledOnce();
    expect(window.close).not.toHaveBeenCalled();
    expect(timeouts.map((timeout) => timeout.milliseconds)).toEqual([CLOSE_TIMEOUT]);
  });

  test("closes the window when the renderer is ready, and lets that close through", () => {
    const { window, tryClose, ready, timeouts } = setup();
    tryClose();
    ready();
    expect(window.close).toHaveBeenCalledOnce();
    expect(timeouts[0]?.cleared).toBe(true);
    expect(tryClose()).toBe(false);
  });

  test("closes the window after the timeout when the renderer does not answer", () => {
    const { window, tryClose, ready, timeouts } = setup();
    tryClose();
    timeouts[0]?.callback();
    expect(window.close).toHaveBeenCalledOnce();
    // A late answer closes nothing again.
    ready();
    expect(window.close).toHaveBeenCalledOnce();
  });

  test("keeps holding a second close back while it waits, without asking again", () => {
    const { window, tryClose } = setup();
    tryClose();
    expect(tryClose()).toBe(true);
    expect(window.requestClose).toHaveBeenCalledOnce();
  });

  test("uses real timers by default", () => {
    vi.useFakeTimers();
    try {
      let listener: ((prevent: () => void) => void) | undefined;
      const close = vi.fn();
      guardClose({
        onClose: (registered) => {
          listener = registered;
        },
        requestClose: () => undefined,
        onceReady: () => undefined,
        close,
      });
      listener?.(() => undefined);
      vi.advanceTimersByTime(CLOSE_TIMEOUT - 1);
      expect(close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
