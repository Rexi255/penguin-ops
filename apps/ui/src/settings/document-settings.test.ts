// @vitest-environment jsdom
// Tests of the settings that act on the whole page (ADR 0110): the font size scales the root font
// size, and "reduce motion" is the root's data-reduce-motion attribute that tokens.css reads.
import { describe, expect, test } from "vitest";

import { applyDocumentSettings } from "./document-settings";

describe("applyDocumentSettings", () => {
  test.each([
    [80, "80%"],
    [130, "130%"],
    [200, "200%"],
  ])("sets the root font size of %i percent", (fontSize, expected) => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { fontSize, reduceMotion: "system" });
    expect(root.style.fontSize).toBe(expected);
  });

  test("leaves the browser's root font size at 100 percent", () => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { fontSize: 150, reduceMotion: "system" });
    applyDocumentSettings(root, { fontSize: 100, reduceMotion: "system" });
    expect(root.style.fontSize).toBe("");
    expect(root.getAttribute("style")).toBe("");
  });

  test.each(["system", "on", "off"] as const)("marks reduce motion %s on the root", (setting) => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { fontSize: 100, reduceMotion: setting });
    expect(root.getAttribute("data-reduce-motion")).toBe(setting);
  });
});
