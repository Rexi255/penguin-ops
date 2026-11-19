import { describe, expect, test } from "vitest";

import {
  columnsFor,
  DEFAULT_COLUMNS,
  type TerminalKey,
  type TerminalKeyAction,
  terminalKeyAction,
} from "./terminal-keys";

function key(name: string, modifiers: Partial<Omit<TerminalKey, "key">> = {}): TerminalKey {
  return {
    key: name,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

describe("terminalKeyAction", () => {
  test.each<[string, TerminalKeyAction]>([
    ["Enter", "submit"],
    ["Backspace", "delete-backward"],
    ["Delete", "delete-forward"],
    ["ArrowLeft", "move-left"],
    ["ArrowRight", "move-right"],
    ["ArrowUp", "history-up"],
    ["ArrowDown", "history-down"],
    ["Home", "move-to-start"],
    ["End", "move-to-end"],
    ["Tab", "complete"],
  ])("maps %s to %s", (name, action) => {
    expect(terminalKeyAction(key(name))).toBe(action);
  });

  test.each<[string, TerminalKeyAction]>([
    ["a", "move-to-start"],
    ["e", "move-to-end"],
    ["c", "interrupt"],
    ["l", "clear-screen"],
    ["A", "move-to-start"],
  ])("maps Ctrl+%s to %s", (name, action) => {
    expect(terminalKeyAction(key(name, { ctrlKey: true }))).toBe(action);
  });

  test.each(["w", "r", "u", "k", "d", "z", "x"])(
    "ignores Ctrl+%s, which readline binds but the game does not simulate yet",
    (name) => {
      expect(terminalKeyAction(key(name, { ctrlKey: true }))).toBe("ignore");
    },
  );

  test.each<[string, TerminalKeyAction]>([
    ["Enter", "submit"],
    ["Backspace", "delete-backward"],
    ["PageUp", "scroll-up"],
    ["PageDown", "scroll-down"],
  ])("maps Shift+%s to %s", (name, action) => {
    expect(terminalKeyAction(key(name, { shiftKey: true }))).toBe(action);
  });

  test("leaves typed characters, Esc, the F-keys and the plain page keys to the browser", () => {
    for (const name of ["a", "Z", " ", "~", "Escape", "F1", "F11", "PageUp", "Dead", "Shift"]) {
      expect(terminalKeyAction(key(name))).toBeUndefined();
    }
  });

  test("leaves Shift+Tab to the browser, so the focus can leave the terminal", () => {
    expect(terminalKeyAction(key("Tab", { shiftKey: true }))).toBeUndefined();
  });

  test("leaves the paste keys to the browser", () => {
    expect(terminalKeyAction(key("v", { ctrlKey: true }))).toBeUndefined();
    expect(terminalKeyAction(key("V", { ctrlKey: true, shiftKey: true }))).toBeUndefined();
  });

  test("never takes an AltGr character (Ctrl+Alt on Windows) for a Ctrl key", () => {
    for (const name of ["@", "~", "|", "{", "e", "l"]) {
      expect(terminalKeyAction(key(name, { ctrlKey: true, altKey: true }))).toBeUndefined();
    }
  });

  test("leaves Alt and Meta combinations and Ctrl with other keys to the browser", () => {
    expect(terminalKeyAction(key("b", { altKey: true }))).toBeUndefined();
    expect(terminalKeyAction(key("c", { metaKey: true }))).toBeUndefined();
    expect(terminalKeyAction(key("Enter", { ctrlKey: true }))).toBeUndefined();
    expect(terminalKeyAction(key("1", { ctrlKey: true }))).toBeUndefined();
    expect(terminalKeyAction(key("ArrowLeft", { ctrlKey: true }))).toBeUndefined();
  });
});

describe("columnsFor", () => {
  test("counts the whole cells that fit", () => {
    expect(columnsFor(768, 9.6)).toBe(80);
    expect(columnsFor(775, 9.6)).toBe(80);
    expect(columnsFor(5, 9.6)).toBe(1);
  });

  test("counts a width a hair below a whole number of cells as that number", () => {
    expect(columnsFor(767.999, 9.6)).toBe(80);
  });

  test("falls back to 80 columns without a measured size", () => {
    expect(columnsFor(0, 9.6)).toBe(DEFAULT_COLUMNS);
    expect(columnsFor(800, 0)).toBe(DEFAULT_COLUMNS);
    expect(columnsFor(Number.NaN, 9.6)).toBe(DEFAULT_COLUMNS);
    expect(DEFAULT_COLUMNS).toBe(80);
  });
});
