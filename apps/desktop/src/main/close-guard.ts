// Saving on exit (ROADMAP M3.7c, ADR 0013, ADR 0106): when the window is about to close, for the
// window's close button as for Quit, the main process holds the close back, asks the renderer to
// save the game being played and closes the window once the renderer says it is done, or after
// `CLOSE_TIMEOUT` milliseconds, so that a renderer that hangs never keeps the game open.

import { REAL_TIMERS, type Timers } from "./timers";

/** How long the window waits for the renderer to save before it closes anyway. */
export const CLOSE_TIMEOUT = 5000;

/** What the guard needs of a window; `createMainWindow` adapts the BrowserWindow. */
export interface GuardedWindow {
  /** Calls `listener` before the window closes; `prevent` keeps it open. */
  readonly onClose: (listener: (prevent: () => void) => void) => void;
  /** Asks the renderer to get ready for closing. */
  readonly requestClose: () => void;
  /** Calls `listener` once, when the renderer says that it is ready to close. */
  readonly onceReady: (listener: () => void) => void;
  /** Closes the window. */
  readonly close: () => void;
}

/** Holds every close of `window` back until its renderer is ready or the timeout ran out. */
export function guardClose(window: GuardedWindow, timers: Timers = REAL_TIMERS): void {
  let state: "open" | "waiting" | "closing" = "open";
  window.onClose((prevent) => {
    if (state === "closing") {
      return;
    }
    prevent();
    if (state === "waiting") {
      return;
    }
    state = "waiting";
    const close = () => {
      if (state !== "waiting") {
        return;
      }
      state = "closing";
      timers.clearTimeout(timer);
      window.close();
    };
    const timer = timers.setTimeout(close, CLOSE_TIMEOUT);
    window.onceReady(close);
    window.requestClose();
  });
}
