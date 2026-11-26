// Fullscreen (ROADMAP M3.8b, ADR 0020, ADR 0109). The fullscreen setting lives in the settings
// file, which only the renderer reads (ADR 0108), so the window starts hidden and appears when the
// renderer first says whether it is to fill the screen: the player never sees it switch. A
// renderer that never says shows the window `SHOW_TIMEOUT` milliseconds after its first paint.
//
// F11 belongs to the main process: it toggles fullscreen on every screen, in menus and dialogs as
// in the terminal, and the page and the application menu never see the key. Every change that
// does not come from the renderer, by F11 or by the system's window manager, is reported to the
// renderer, which stores it in the settings.

import { REAL_TIMERS, type Timers } from "./timers";

/** How long after its first paint the window waits for the renderer before it appears anyway. */
export const SHOW_TIMEOUT = 5000;

/** What the display control needs of a window; `createMainWindow` adapts the BrowserWindow. */
export interface DisplayedWindow {
  readonly setFullScreen: (on: boolean) => void;
  /** Shows the hidden window. */
  readonly show: () => void;
  /** Calls `listener` once, when the page has painted for the first time. */
  readonly onceReadyToShow: (listener: () => void) => void;
  /** Calls `listener` whenever the window entered (`true`) or left (`false`) fullscreen. */
  readonly onFullScreenChange: (listener: (on: boolean) => void) => void;
  /** Calls `listener` for every press of the fullscreen key F11. */
  readonly onToggleKey: (listener: () => void) => void;
  /** Tells the renderer whether the window fills the screen now. */
  readonly reportFullScreen: (on: boolean) => void;
}

/** What the renderer can do with the window's display. */
export interface DisplayControl {
  /** Makes the window fill the screen or not, and shows it if it is still hidden. */
  readonly setFullscreen: (on: boolean) => void;
}

/** Throws a TypeError unless `on` is a boolean, as the renderer has to send it. */
export function checkFullscreen(on: unknown): asserts on is boolean {
  if (typeof on !== "boolean") {
    throw new TypeError("Fullscreen must be true or false.");
  }
}

/** Starts controlling the display of the hidden `window`. */
export function controlDisplay(
  window: DisplayedWindow,
  timers: Timers = REAL_TIMERS,
): DisplayControl {
  // The state the window was last set to or reported, so that F11 toggles it even where the
  // window manager does not report the changes.
  let fullscreen = false;
  let shown = false;
  let timer: unknown;

  const show = () => {
    if (shown) {
      return;
    }
    shown = true;
    if (timer !== undefined) {
      timers.clearTimeout(timer);
    }
    window.show();
  };

  const set = (on: boolean) => {
    fullscreen = on;
    window.setFullScreen(on);
  };

  window.onceReadyToShow(() => {
    if (!shown) {
      timer = timers.setTimeout(show, SHOW_TIMEOUT);
    }
  });
  window.onFullScreenChange((on) => {
    fullscreen = on;
    window.reportFullScreen(on);
  });
  window.onToggleKey(() => {
    set(!fullscreen);
    window.reportFullScreen(fullscreen);
  });

  return {
    setFullscreen: (on) => {
      set(on);
      show();
    },
  };
}

/** A key press as Electron's `before-input-event` describes it, as far as F11 needs it. */
export interface KeyInput {
  readonly type: string;
  readonly key: string;
  readonly isAutoRepeat: boolean;
  readonly shift: boolean;
  readonly control: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

/**
 * What a key press means for fullscreen: `toggle` for F11 alone; `swallow` for the repeats while
 * F11 is held, which neither toggle again nor reach the page or the application menu; `pass` for
 * every other key, which goes on to the page.
 */
export function fullscreenKeyAction(input: KeyInput): "toggle" | "swallow" | "pass" {
  if (
    input.type !== "keyDown" ||
    input.key !== "F11" ||
    input.shift ||
    input.control ||
    input.alt ||
    input.meta
  ) {
    return "pass";
  }
  return input.isAutoRepeat ? "swallow" : "toggle";
}
