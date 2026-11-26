import { describe, expect, test, vi } from "vitest";

import {
  checkFullscreen,
  controlDisplay,
  type DisplayedWindow,
  fullscreenKeyAction,
  type KeyInput,
  SHOW_TIMEOUT,
} from "./fullscreen";
import type { Timers } from "./timers";

/** A hidden window whose events the test fires, and timers the test runs by hand. */
function setup() {
  let readyListener: (() => void) | undefined;
  let changeListener: ((on: boolean) => void) | undefined;
  let keyListener: (() => void) | undefined;
  const timeouts: { callback: () => void; milliseconds: number; cleared: boolean }[] = [];
  const window = {
    setFullScreen: vi.fn<(on: boolean) => void>(),
    show: vi.fn<() => void>(),
    onceReadyToShow: (listener: () => void) => {
      readyListener = listener;
    },
    onFullScreenChange: (listener: (on: boolean) => void) => {
      changeListener = listener;
    },
    onToggleKey: (listener: () => void) => {
      keyListener = listener;
    },
    reportFullScreen: vi.fn<(on: boolean) => void>(),
  } satisfies DisplayedWindow;
  const timers: Timers = {
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
  const control = controlDisplay(window, timers);
  return {
    window,
    control,
    timeouts,
    readyToShow: () => readyListener?.(),
    systemChanges: (on: boolean) => changeListener?.(on),
    pressF11: () => keyListener?.(),
  };
}

describe("controlDisplay", () => {
  test("shows the window in the mode the renderer asks for", () => {
    const { window, control } = setup();
    expect(window.show).not.toHaveBeenCalled();
    control.setFullscreen(true);
    expect(window.setFullScreen).toHaveBeenCalledWith(true);
    expect(window.show).toHaveBeenCalledOnce();
    // The mode is set before the window appears, so that the player never sees it switch.
    expect(window.setFullScreen.mock.invocationCallOrder[0]).toBeLessThan(
      window.show.mock.invocationCallOrder[0] ?? 0,
    );
  });

  test("shows the window only once", () => {
    const { window, control } = setup();
    control.setFullscreen(false);
    control.setFullscreen(true);
    expect(window.setFullScreen.mock.calls).toEqual([[false], [true]]);
    expect(window.show).toHaveBeenCalledOnce();
  });

  test("does not report a change that the renderer asked for itself", () => {
    const { window, control } = setup();
    control.setFullscreen(true);
    expect(window.reportFullScreen).not.toHaveBeenCalled();
  });

  test("shows the window after the timeout when the renderer never asks", () => {
    const { window, timeouts, readyToShow } = setup();
    readyToShow();
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]?.milliseconds).toBe(SHOW_TIMEOUT);
    expect(window.show).not.toHaveBeenCalled();
    timeouts[0]?.callback();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.setFullScreen).not.toHaveBeenCalled();
  });

  test("stops the timeout when the renderer asks in time", () => {
    const { window, control, timeouts, readyToShow } = setup();
    readyToShow();
    control.setFullscreen(true);
    expect(timeouts[0]?.cleared).toBe(true);
    timeouts[0]?.callback();
    expect(window.show).toHaveBeenCalledOnce();
  });

  test("starts no timeout when the renderer asked before the first paint", () => {
    const { control, timeouts, readyToShow } = setup();
    control.setFullscreen(false);
    readyToShow();
    expect(timeouts).toEqual([]);
  });

  test("toggles fullscreen with F11 and reports it", () => {
    const { window, control, pressF11 } = setup();
    control.setFullscreen(true);
    pressF11();
    expect(window.setFullScreen).toHaveBeenLastCalledWith(false);
    expect(window.reportFullScreen).toHaveBeenLastCalledWith(false);
    pressF11();
    expect(window.setFullScreen).toHaveBeenLastCalledWith(true);
    expect(window.reportFullScreen).toHaveBeenLastCalledWith(true);
  });

  test("reports a change by the system and toggles from there", () => {
    const { window, control, systemChanges, pressF11 } = setup();
    control.setFullscreen(true);
    systemChanges(false);
    expect(window.reportFullScreen).toHaveBeenLastCalledWith(false);
    pressF11();
    expect(window.setFullScreen).toHaveBeenLastCalledWith(true);
    expect(window.reportFullScreen).toHaveBeenLastCalledWith(true);
  });
});

describe("checkFullscreen", () => {
  test.each([true, false])("accepts %s", (on) => {
    expect(() => {
      checkFullscreen(on);
    }).not.toThrow();
  });

  test.each([undefined, null, 1, "true", {}])("rejects %j", (on) => {
    expect(() => {
      checkFullscreen(on);
    }).toThrow(new TypeError("Fullscreen must be true or false."));
  });
});

describe("fullscreenKeyAction", () => {
  const F11: KeyInput = {
    type: "keyDown",
    key: "F11",
    isAutoRepeat: false,
    shift: false,
    control: false,
    alt: false,
    meta: false,
  };

  test("toggles on F11 alone", () => {
    expect(fullscreenKeyAction(F11)).toBe("toggle");
  });

  test("swallows the repeats of F11 held down", () => {
    expect(fullscreenKeyAction({ ...F11, isAutoRepeat: true })).toBe("swallow");
  });

  test.each([
    ["the key going up", { type: "keyUp" }],
    ["another key", { key: "F1" }],
    ["Shift+F11", { shift: true }],
    ["Ctrl+F11", { control: true }],
    ["Alt+F11", { alt: true }],
    ["Meta+F11", { meta: true }],
  ])("passes %s to the page", (_name, change) => {
    expect(fullscreenKeyAction({ ...F11, ...change })).toBe("pass");
  });
});
