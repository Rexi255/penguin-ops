import { describe, expect, test } from "vitest";

import { displayWidth } from "./display-width";

describe("displayWidth", () => {
  test("counts one cell per character of ASCII and most other scripts", () => {
    expect(displayWidth("")).toBe(0);
    expect(displayWidth("notes.txt")).toBe(9);
    expect(displayWidth("Übersicht")).toBe(9);
    expect(displayWidth("Ελληνικά")).toBe(8);
  });

  test("counts no cell for combining marks and format characters", () => {
    expect(displayWidth("U\u0308bersicht")).toBe(9);
    expect(displayWidth("a\u200bb")).toBe(2);
    expect(displayWidth("\u1100\u1161")).toBe(2);
  });

  test("counts one cell for the soft hyphen, like glibc", () => {
    expect(displayWidth("a\u00adb")).toBe(3);
  });

  test("@differential counts two cells for East Asian wide characters and emoji", () => {
    expect(displayWidth("日本語")).toBe(6);
    expect(displayWidth("한국")).toBe(4);
    expect(displayWidth("ＡＢ")).toBe(4);
    expect(displayWidth("😀 ok")).toBe(5);
    expect(displayWidth("⌚")).toBe(2);
    expect(displayWidth("𠀀")).toBe(2);
  });
});
