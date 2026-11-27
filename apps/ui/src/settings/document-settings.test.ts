// @vitest-environment jsdom
// Tests of the settings that act on the whole page (ADR 0110): the font size scales the root font
// size, and "reduce motion", the colour scheme (ADR 0111) and the effects (ADR 0112) are the
// root's data-reduce-motion, data-color-scheme, data-glow and data-scanlines attributes that
// tokens.css reads.
import { COLOR_SCHEMES, DEFAULT_SETTINGS } from "@penguin-ops/gameplay";
import { describe, expect, test } from "vitest";

import { applyDocumentSettings } from "./document-settings";

/** The page settings of the default settings: 100 percent, no scheme of its own, no effects. */
const BASE = {
  fontSize: 100,
  reduceMotion: "system",
  colorScheme: "default",
  effects: DEFAULT_SETTINGS.effects,
} as const;

describe("applyDocumentSettings", () => {
  test.each([
    [80, "80%"],
    [130, "130%"],
    [200, "200%"],
  ])("sets the root font size of %i percent", (fontSize, expected) => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { ...BASE, fontSize });
    expect(root.style.fontSize).toBe(expected);
  });

  test("leaves the browser's root font size at 100 percent", () => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { ...BASE, fontSize: 150 });
    applyDocumentSettings(root, { ...BASE, fontSize: 100 });
    expect(root.style.fontSize).toBe("");
    expect(root.getAttribute("style")).toBe("");
  });

  test.each(["system", "on", "off"] as const)("marks reduce motion %s on the root", (setting) => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { ...BASE, reduceMotion: setting });
    expect(root.getAttribute("data-reduce-motion")).toBe(setting);
  });

  test.each(COLOR_SCHEMES)("marks the colour scheme %s on the root", (colorScheme) => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { ...BASE, colorScheme });
    expect(root.getAttribute("data-color-scheme")).toBe(colorScheme);
  });

  test("replaces the colour scheme of an earlier call", () => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { ...BASE, colorScheme: "solarized" });
    applyDocumentSettings(root, { ...BASE, fontSize: 100 });
    expect(root.getAttribute("data-color-scheme")).toBe("default");
  });

  test("marks both effects off on the root by default", () => {
    const root = document.createElement("html");
    applyDocumentSettings(root, BASE);
    expect(root.getAttribute("data-glow")).toBe("off");
    expect(root.getAttribute("data-scanlines")).toBe("off");
  });

  test.each([
    [{ glow: true, scanlines: false }, "on", "off"],
    [{ glow: false, scanlines: true }, "off", "on"],
    [{ glow: true, scanlines: true }, "on", "on"],
  ])("marks the effects %o on the root", (effects, glow, scanlines) => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { ...BASE, effects });
    expect(root.getAttribute("data-glow")).toBe(glow);
    expect(root.getAttribute("data-scanlines")).toBe(scanlines);
  });

  test("turns an effect off again", () => {
    const root = document.createElement("html");
    applyDocumentSettings(root, { ...BASE, effects: { glow: true, scanlines: true } });
    applyDocumentSettings(root, BASE);
    expect(root.getAttribute("data-glow")).toBe("off");
    expect(root.getAttribute("data-scanlines")).toBe("off");
  });
});
