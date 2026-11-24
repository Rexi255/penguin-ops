// The settings as the game reads them at start (ROADMAP M3.8a, ADR 0013, ADR 0108). The desktop
// stores the settings file as a text; this module reads it with the gameplay package. Settings
// are replaceable, progress is not: whatever is wrong with the file, the game starts, with the
// default for every setting it cannot read, and every problem goes to the log. The file is not
// written back at start; it is written when the player changes a setting.

import {
  DEFAULT_SETTINGS,
  parseSettings,
  type Settings,
  type SettingsProblem,
} from "@penguin-ops/gameplay";

import type { SettingsFileApi } from "../desktop-api";

/**
 * Reads the settings file through `api`. A missing file gives the default settings without a
 * message; a file that cannot be read or parsed, and a read that fails, are logged with `log`.
 */
export async function loadSettings(
  api: Pick<SettingsFileApi, "read">,
  log: (message: string, detail?: unknown) => void,
): Promise<Settings> {
  let file;
  try {
    file = await api.read();
  } catch (error) {
    log("PenguinOps could not read the settings and uses the default settings:", error);
    return DEFAULT_SETTINGS;
  }
  switch (file.kind) {
    case "missing":
      return DEFAULT_SETTINGS;
    case "unreadable":
      log("PenguinOps could not read the settings file and uses the default settings.");
      return DEFAULT_SETTINGS;
    case "text": {
      const { settings, problems } = parseSettings(file.text);
      for (const problem of problems) {
        log(`PenguinOps settings file: ${describeProblem(problem)}`);
      }
      return settings;
    }
  }
}

/** The English description of a settings problem, for the log. */
export function describeProblem(problem: SettingsProblem): string {
  switch (problem.code) {
    case "not-json":
      return "the file is no JSON; the default settings are used.";
    case "not-settings":
      return "the file is no settings file; the default settings are used.";
    case "too-new":
      return `a newer version of the game wrote the file (format version ${String(problem.version)}); the default settings are used.`;
    case "invalid":
      return `${problem.path}: ${problem.message}; ${
        problem.path === "version" ? "the default settings are used" : "its default is used"
      }.`;
    case "unknown":
      return `${problem.path}: the setting is unknown and ignored.`;
  }
}
