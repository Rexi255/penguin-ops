// @vitest-environment jsdom
// Tests of the settings that act on the whole page (ADR 0110): the font size scales the root font
// size, and "reduce motion" and the colour scheme (ADR 0111) are the root's data-reduce-motion and
// data-color-scheme attributes that tokens.css reads.
import { COLOR_SCHEMES } from "@penguin-ops/gameplay";
import { describe, expect, test } from "vitest";

import { applyDocumentSettings } from "./document-settings";

describe("applyDocumentSettings", () => {
  test.each([
    [80, "80%"],
    [130, "130%"],
    [200, "200%"],
  ])("sets the root font size of %i percent", (fontSize, expected) => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { fontSize, reduceMotion: "system", colorScheme: "default" });
    expect(root.style.fontSize).toBe(expected);
  });

  test("leaves the browser's root font size at 100 percent", () => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { fontSize: 150, reduceMotion: "system", colorScheme: "default" });
    applyDocumentSettings(root, { fontSize: 100, reduceMotion: "system", colorScheme: "default" });
    expect(root.style.fontSize).toBe("");
    expect(root.getAttribute("style")).toBe("");
  });

  test.each(["system", "on", "off"] as const)("marks reduce motion %s on the root", (setting) => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { fontSize: 100, reduceMotion: setting, colorScheme: "default" });
    expect(root.getAttribute("data-reduce-motion")).toBe(setting);
  });

  test.each(COLOR_SCHEMES)("marks the colour scheme %s on the root", (colorScheme) => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { fontSize: 100, reduceMotion: "system", colorScheme });
    expect(root.getAttribute("data-color-scheme")).toBe(colorScheme);
  });

  test("replaces the colour scheme of an earlier call", () => {
    const root = document.createElement("html");
    applyDocumentSettings(root, {
      fontSize: 100,
      reduceMotion: "system",
      colorScheme: "solarized",
    });
    applyDocumentSettings(root, { fontSize: 100, reduceMotion: "system", colorScheme: "default" });
    expect(root.getAttribute("data-color-scheme")).toBe("default");
  });
});
