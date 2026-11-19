// Which key does what in the terminal (ADR 0095): the keys of bash 5.2 with readline 8.2 and
// Debian 13's `/etc/inputrc` that the game simulates, and the scroll keys of the terminal
// emulator. Typed characters do not come through here; the terminal takes them from its input
// element, so that dead keys, AltGr and input methods work on every keyboard layout.

/** What a key press does in the terminal. */
export type TerminalKeyAction =
  | "submit"
  | "delete-backward"
  | "delete-forward"
  | "move-left"
  | "move-right"
  | "move-to-start"
  | "move-to-end"
  | "history-up"
  | "history-down"
  | "complete"
  | "interrupt"
  | "clear-screen"
  | "scroll-up"
  | "scroll-down"
  /**
   * A Ctrl key that readline binds to a function the game does not simulate yet, such as Ctrl+W
   * or Ctrl+R: it does nothing, and it never reaches the app (where Ctrl+W would close the window
   * and Ctrl+R would reload it).
   */
  | "ignore";

/** The parts of a keyboard event that decide the action. */
export interface TerminalKey {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/** Keys without Ctrl, Alt, Meta and Shift. */
const PLAIN_KEYS: Readonly<Record<string, TerminalKeyAction>> = {
  Enter: "submit",
  Backspace: "delete-backward",
  Delete: "delete-forward",
  ArrowLeft: "move-left",
  ArrowRight: "move-right",
  ArrowUp: "history-up",
  ArrowDown: "history-down",
  Home: "move-to-start",
  End: "move-to-end",
  Tab: "complete",
};

/** Keys with Shift alone. */
const SHIFT_KEYS: Readonly<Record<string, TerminalKeyAction>> = {
  Enter: "submit",
  Backspace: "delete-backward",
  PageUp: "scroll-up",
  PageDown: "scroll-down",
};

/** Letters with Ctrl alone. */
const CTRL_KEYS: Readonly<Record<string, TerminalKeyAction>> = {
  a: "move-to-start",
  e: "move-to-end",
  c: "interrupt",
  l: "clear-screen",
};

/**
 * Ctrl+V pastes, as in Windows Terminal: the browser then sends the clipboard as a paste. (In a
 * Linux terminal readline's `quoted-insert` gets Ctrl+V; players on Windows expect the paste.)
 */
const PASTE_LETTER = "v";

/**
 * The action of a key press, or `undefined` if the browser should handle it: typed characters,
 * the paste keys, Shift+Tab (which leaves the terminal for the side panel), Esc and the F-keys (the
 * game's functions, ADR 0020) and every combination with Alt or Meta. On Windows, AltGr arrives
 * as Ctrl+Alt, so a character typed with AltGr (`|`, `~`, `@` on a German keyboard) is never
 * taken for a Ctrl key.
 */
export function terminalKeyAction(event: TerminalKey): TerminalKeyAction | undefined {
  const { key, ctrlKey, altKey, metaKey, shiftKey } = event;
  if (altKey || metaKey) {
    return undefined;
  }
  if (ctrlKey) {
    if (shiftKey) {
      return undefined;
    }
    const letter = key.toLowerCase();
    if (!/^[a-z]$/u.test(letter) || letter === PASTE_LETTER) {
      return undefined;
    }
    return CTRL_KEYS[letter] ?? "ignore";
  }
  return (shiftKey ? SHIFT_KEYS : PLAIN_KEYS)[key];
}

/** The terminal width when it cannot be measured, the classic 80 columns. */
export const DEFAULT_COLUMNS = 80;

/**
 * How many character cells fit into `width` pixels with cells `cellWidth` pixels wide: at least
 * one, and `DEFAULT_COLUMNS` if either size is unknown (zero, as in a test without layout).
 * A width a hair below a whole number of cells (rounding of fractional pixels) still counts as
 * that number.
 */
export function columnsFor(width: number, cellWidth: number): number {
  if (!(width > 0 && cellWidth > 0)) {
    return DEFAULT_COLUMNS;
  }
  return Math.max(1, Math.floor((width + 0.01) / cellWidth));
}
