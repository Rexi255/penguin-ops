import { DEFAULT_SETTINGS, type Settings, serializeSettings } from "@penguin-ops/gameplay";
import { describe, expect, test } from "vitest";

import type { StoredFile } from "../desktop-api";
import { describeProblem, loadSettings } from "./settings-file";

const SETTINGS: Settings = { ...DEFAULT_SETTINGS, language: "de", fontSize: 150 };

/** Loads the settings from `file` and records what was logged. */
async function load(file: StoredFile | Error) {
  const logged: unknown[][] = [];
  const settings = await loadSettings(
    { read: () => (file instanceof Error ? Promise.reject(file) : Promise.resolve(file)) },
    (...entry) => {
      logged.push(entry);
    },
  );
  return { settings, logged };
}

describe("loadSettings", () => {
  test("uses the default settings without a message when there is no settings file", async () => {
    expect(await load({ kind: "missing" })).toEqual({ settings: DEFAULT_SETTINGS, logged: [] });
  });

  test("reads the settings of the file", async () => {
    expect(await load({ kind: "text", text: serializeSettings(SETTINGS) })).toEqual({
      settings: SETTINGS,
      logged: [],
    });
  });

  test("uses the default settings and logs it when the file cannot be read", async () => {
    expect(await load({ kind: "unreadable" })).toEqual({
      settings: DEFAULT_SETTINGS,
      logged: [["PenguinOps could not read the settings file and uses the default settings."]],
    });
  });

  test("uses the default settings and logs the error when the read fails", async () => {
    const error = new Error("IPC closed");
    expect(await load(error)).toEqual({
      settings: DEFAULT_SETTINGS,
      logged: [["PenguinOps could not read the settings and uses the default settings:", error]],
    });
  });

  test("keeps the settings it can read and logs every problem", async () => {
    const file = JSON.parse(serializeSettings(SETTINGS)) as Record<string, unknown>;
    const text = JSON.stringify({ ...file, fontSize: 500, theme: "light" });
    expect(await load({ kind: "text", text })).toEqual({
      settings: { ...SETTINGS, fontSize: DEFAULT_SETTINGS.fontSize },
      logged: [
        [
          "PenguinOps settings file: fontSize: the font size cannot be above 200; its default is used.",
        ],
        ["PenguinOps settings file: theme: the setting is unknown and ignored."],
      ],
    });
  });

  test("uses the default settings and logs it when the file is no JSON", async () => {
    expect(await load({ kind: "text", text: "{ broken" })).toEqual({
      settings: DEFAULT_SETTINGS,
      logged: [["PenguinOps settings file: the file is no JSON; the default settings are used."]],
    });
  });
});

describe("describeProblem", () => {
  test.each([
    [
      { code: "not-settings" } as const,
      "the file is no settings file; the default settings are used.",
    ],
    [
      { code: "too-new", version: 2 } as const,
      "a newer version of the game wrote the file (format version 2); the default settings are used.",
    ],
    [
      {
        code: "invalid",
        path: "version",
        message: "the version must be a whole number from 1",
      } as const,
      "version: the version must be a whole number from 1; the default settings are used.",
    ],
    [
      { code: "invalid", path: "volumes", message: "the group of settings is missing" } as const,
      "volumes: the group of settings is missing; its default is used.",
    ],
  ])("describes %j", (problem, description) => {
    expect(describeProblem(problem)).toBe(description);
  });
});
