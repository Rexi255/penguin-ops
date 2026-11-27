// The settings format (ROADMAP M3.8a, ADR 0013, ADR 0108): the game's global settings, the same
// for every save slot, how they are written as text and read back. Like a save file, the
// settings file names its format version, an older version is converted step by step with the
// migrations in `SETTINGS_MIGRATIONS`, and every change of the format adds one.
//
// Settings are replaceable, progress is not: reading never refuses a settings file. A file that
// cannot be read gives the default settings, and a single setting that is missing or breaks the
// format gives its own default while the other settings of the file are kept. Every problem is
// reported, for the log.
//
// The module is pure: the desktop app's main process stores the text, and the UI applies the
// settings. Which settings the player can change, and when they take effect, comes with their
// work packages (ROADMAP M3.8b, M3.8c, M3.9, M3.10).

import { MANDATORY_LANGUAGES, type MandatoryLanguage } from "@penguin-ops/content";
import { z } from "zod";

/** The name every settings file carries in its `format` field, to tell it from other files. */
export const SETTINGS_FORMAT_NAME = "penguin-ops-settings";

/** The settings format version that this game writes and reads after migrating older files. */
export const SETTINGS_FORMAT_VERSION = 1;

/**
 * The language setting: a language of the game, or `system` for the operating system's language
 * (ADR 0012).
 */
export const LANGUAGE_SETTINGS = ["system", ...MANDATORY_LANGUAGES] as const;

export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** The colour schemes of ADR 0020; tokens.css gives each its token values (ADR 0111). */
export const COLOR_SCHEMES = ["default", "retro-crt", "solarized", "high-contrast"] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/**
 * The "reduce motion" setting: `system` follows the operating system's setting
 * (`prefers-reduced-motion`), `on` and `off` override it.
 */
export const REDUCE_MOTION_SETTINGS = ["system", "on", "off"] as const;

export type ReduceMotionSetting = (typeof REDUCE_MOTION_SETTINGS)[number];

/** The lowest and highest volume, in percent. */
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 100;

/** The smallest and largest font size, in percent of the design's type scale (ADR 0085). */
export const FONT_SIZE_MIN = 80;
export const FONT_SIZE_MAX = 200;

/** The volumes of ADR 0020, each a whole percentage from `VOLUME_MIN` to `VOLUME_MAX`. */
export interface Volumes {
  /** Scales every sound. */
  readonly master: number;
  /** The background music. */
  readonly music: number;
  /** The UI sounds. */
  readonly effects: number;
}

/** The optional effects of ADR 0020. "Reduce motion" turns them off, whatever they are set to. */
export interface Effects {
  /** A soft glow around the terminal's text. */
  readonly glow: boolean;
  /** Scanlines over the terminal, like an old monitor. */
  readonly scanlines: boolean;
}

/** The game's settings (ADR 0013). */
export interface Settings {
  readonly language: LanguageSetting;
  readonly volumes: Volumes;
  /** Whether the window fills the screen (ADR 0020). */
  readonly fullscreen: boolean;
  /** The font size in percent of the design's type scale, from `FONT_SIZE_MIN` to `FONT_SIZE_MAX`. */
  readonly fontSize: number;
  readonly colorScheme: ColorScheme;
  readonly effects: Effects;
  readonly reduceMotion: ReduceMotionSetting;
}

/**
 * The settings of a game that has no settings file yet: the system's language and motion
 * setting, fullscreen on the first start (ADR 0020), the design's font size and colour scheme,
 * and no effects.
 */
export const DEFAULT_SETTINGS: Settings = {
  language: "system",
  volumes: { master: 80, music: 50, effects: 80 },
  fullscreen: true,
  fontSize: 100,
  colorScheme: "default",
  effects: { glow: false, scanlines: false },
  reduceMotion: "system",
};

/**
 * A problem found while reading a settings file:
 *
 * - `not-json`: the text is not JSON; the default settings are used;
 * - `not-settings`: the JSON is no object with the `format` field `SETTINGS_FORMAT_NAME`; the
 *   default settings are used;
 * - `too-new`: a newer version of the game wrote the file (`version`); its settings may mean
 *   something else now, so the default settings are used;
 * - `invalid`: the value at `path` (a dotted path such as `volumes.music`) breaks the format;
 *   for a setting, its default is used; for `version`, the default settings are used. `message`
 *   says how, in English, for the log;
 * - `unknown`: the file has a field at `path` that the format does not know; it is ignored.
 */
export type SettingsProblem =
  | { readonly code: "not-json" }
  | { readonly code: "not-settings" }
  | { readonly code: "too-new"; readonly version: number }
  | { readonly code: "invalid"; readonly path: string; readonly message: string }
  | { readonly code: "unknown"; readonly path: string };

/** The result of `parseSettings`. */
export interface SettingsParseResult {
  /** The settings to use: the file's, with a default for every setting it lacks. */
  readonly settings: Settings;
  /** Every problem found, in the order of the file's settings; empty for a sound file. */
  readonly problems: readonly SettingsProblem[];
}

/**
 * A step from one settings format version to the next. `migrate` gets the parsed JSON object of
 * a file of version `from` and returns the object as version `from + 1` writes it;
 * `migrateSettings` sets the new `version` field.
 */
export interface SettingsMigration {
  readonly from: number;
  readonly migrate: (settings: Readonly<Record<string, unknown>>) => Record<string, unknown>;
}

/**
 * The migrations of the settings format, one for each version before `SETTINGS_FORMAT_VERSION`,
 * in order. Every change of the format adds one, with a stored example file of the old version in
 * `packages/gameplay/settings-fixtures/`.
 */
export const SETTINGS_MIGRATIONS: readonly SettingsMigration[] = [];

/**
 * The text of the settings file of `settings`: JSON in the current format version with every
 * setting in a fixed order, indented by two spaces and ending with a line break, so that the same
 * settings always give the same text.
 */
export function serializeSettings(settings: Settings): string {
  const file = {
    format: SETTINGS_FORMAT_NAME,
    version: SETTINGS_FORMAT_VERSION,
    language: settings.language,
    volumes: {
      master: settings.volumes.master,
      music: settings.volumes.music,
      effects: settings.volumes.effects,
    },
    fullscreen: settings.fullscreen,
    fontSize: settings.fontSize,
    colorScheme: settings.colorScheme,
    effects: { glow: settings.effects.glow, scanlines: settings.effects.scanlines },
    reduceMotion: settings.reduceMotion,
  };
  return `${JSON.stringify(file, undefined, 2)}\n`;
}

/**
 * Reads the text of a settings file: checks that it is a settings file, migrates an older version
 * to the current one and reads every setting on its own. Never throws for a broken file.
 */
export function parseSettings(text: string): SettingsParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return defaultsBecause({ code: "not-json" });
  }
  if (!isRecord(data) || data["format"] !== SETTINGS_FORMAT_NAME) {
    return defaultsBecause({ code: "not-settings" });
  }
  const version = data["version"];
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
    return defaultsBecause({
      code: "invalid",
      path: "version",
      message: "the version must be a whole number from 1",
    });
  }
  if (version > SETTINGS_FORMAT_VERSION) {
    return defaultsBecause({ code: "too-new", version });
  }
  const file = migrateSettings(data, version, SETTINGS_FORMAT_VERSION, SETTINGS_MIGRATIONS);
  const problems: SettingsProblem[] = [];
  const reader = new FieldReader(problems);
  const volumes = reader.group(file, "volumes");
  const effects = reader.group(file, "effects");
  const settings: Settings = {
    language: reader.read(file, "language", languageSchema, DEFAULT_SETTINGS.language),
    volumes: {
      master: reader.read(volumes, "volumes.master", volumeSchema, DEFAULT_SETTINGS.volumes.master),
      music: reader.read(volumes, "volumes.music", volumeSchema, DEFAULT_SETTINGS.volumes.music),
      effects: reader.read(
        volumes,
        "volumes.effects",
        volumeSchema,
        DEFAULT_SETTINGS.volumes.effects,
      ),
    },
    fullscreen: reader.read(file, "fullscreen", switchSchema, DEFAULT_SETTINGS.fullscreen),
    fontSize: reader.read(file, "fontSize", fontSizeSchema, DEFAULT_SETTINGS.fontSize),
    colorScheme: reader.read(file, "colorScheme", colorSchemeSchema, DEFAULT_SETTINGS.colorScheme),
    effects: {
      glow: reader.read(effects, "effects.glow", switchSchema, DEFAULT_SETTINGS.effects.glow),
      scanlines: reader.read(
        effects,
        "effects.scanlines",
        switchSchema,
        DEFAULT_SETTINGS.effects.scanlines,
      ),
    },
    reduceMotion: reader.read(
      file,
      "reduceMotion",
      reduceMotionSchema,
      DEFAULT_SETTINGS.reduceMotion,
    ),
  };
  reader.reportUnknown(file, "", FILE_FIELDS);
  reader.reportUnknown(volumes, "volumes", VOLUME_FIELDS);
  reader.reportUnknown(effects, "effects", EFFECT_FIELDS);
  return { settings, problems };
}

/**
 * Converts the parsed settings file `data` of format version `version` to version `target` with
 * `migrations`, one version at a time, and sets its `version` field. Throws if a migration on
 * the way is missing: that is a mistake in the game, not in the file.
 */
export function migrateSettings(
  data: Readonly<Record<string, unknown>>,
  version: number,
  target: number,
  migrations: readonly SettingsMigration[],
): Readonly<Record<string, unknown>> {
  let current = data;
  for (let from = version; from < target; from += 1) {
    const migration = migrations.find((candidate) => candidate.from === from);
    if (migration === undefined) {
      throw new Error(`There is no settings migration from version ${String(from)}.`);
    }
    current = { ...migration.migrate(current), version: from + 1 };
  }
  return current;
}

/**
 * The game's language for the setting `setting`; `system` takes it from the operating system's
 * locale `locale` (a BCP 47 tag such as `de-DE`): German if it starts with `de`, otherwise
 * English (ADR 0012).
 */
export function gameLanguage(setting: LanguageSetting, locale: string): MandatoryLanguage {
  if (setting !== "system") {
    return setting;
  }
  return /^de(?:-|$)/iu.test(locale) ? "de" : "en";
}

function defaultsBecause(problem: SettingsProblem): SettingsParseResult {
  return { settings: DEFAULT_SETTINGS, problems: [problem] };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const languageSchema = z.enum(LANGUAGE_SETTINGS, {
  error: `the language must be one of ${LANGUAGE_SETTINGS.join(", ")}`,
});

const volumeSchema = z
  .int({ error: "a volume must be a whole number" })
  .min(VOLUME_MIN, { error: `a volume cannot be below ${String(VOLUME_MIN)}` })
  .max(VOLUME_MAX, { error: `a volume cannot be above ${String(VOLUME_MAX)}` });

const switchSchema = z.boolean({ error: "the setting must be true or false" });

const fontSizeSchema = z
  .int({ error: "the font size must be a whole number" })
  .min(FONT_SIZE_MIN, { error: `the font size cannot be below ${String(FONT_SIZE_MIN)}` })
  .max(FONT_SIZE_MAX, { error: `the font size cannot be above ${String(FONT_SIZE_MAX)}` });

const colorSchemeSchema = z.enum(COLOR_SCHEMES, {
  error: `the colour scheme must be one of ${COLOR_SCHEMES.join(", ")}`,
});

const reduceMotionSchema = z.enum(REDUCE_MOTION_SETTINGS, {
  error: `reduce motion must be one of ${REDUCE_MOTION_SETTINGS.join(", ")}`,
});

/** The fields of a settings file of the current version, besides the settings in groups. */
const FILE_FIELDS: ReadonlySet<string> = new Set([
  "format",
  "version",
  "language",
  "volumes",
  "fullscreen",
  "fontSize",
  "colorScheme",
  "effects",
  "reduceMotion",
]);

const VOLUME_FIELDS: ReadonlySet<string> = new Set(["master", "music", "effects"]);

const EFFECT_FIELDS: ReadonlySet<string> = new Set(["glow", "scanlines"]);

/** Reads the settings of a file one at a time and collects the problems. */
class FieldReader {
  constructor(private readonly problems: SettingsProblem[]) {}

  /**
   * The group of settings `path` (such as `volumes`) of `file`; an empty group, with a problem,
   * if it is missing or no object, so that each of its settings gets its default.
   */
  group(file: Readonly<Record<string, unknown>>, path: string): Readonly<Record<string, unknown>> {
    const value = file[path];
    if (isRecord(value)) {
      return value;
    }
    this.problems.push({
      code: "invalid",
      path,
      message:
        value === undefined ? "the group of settings is missing" : "the settings must be an object",
    });
    return {};
  }

  /**
   * The setting at the dotted `path` in its group `group`, or `fallback` with a problem if it is
   * missing or breaks `schema`. A missing setting of a group that is itself missing or broken
   * adds no further problem.
   */
  read<T>(
    group: Readonly<Record<string, unknown>>,
    path: string,
    schema: z.ZodType<T>,
    fallback: T,
  ): T {
    const name = path.slice(path.lastIndexOf(".") + 1);
    const groupPath = path.slice(0, Math.max(0, path.lastIndexOf(".")));
    if (!Object.hasOwn(group, name)) {
      if (groupPath === "" || !this.groupHasProblem(groupPath)) {
        this.problems.push({ code: "invalid", path, message: "the setting is missing" });
      }
      return fallback;
    }
    const checked = schema.safeParse(group[name]);
    if (checked.success) {
      return checked.data;
    }
    const [issue] = checked.error.issues;
    this.problems.push({
      code: "invalid",
      path,
      message: issue === undefined ? "the setting is invalid" : issue.message,
    });
    return fallback;
  }

  /** Reports every field of `group` (at `path`, empty for the file) that is not in `known`. */
  reportUnknown(
    group: Readonly<Record<string, unknown>>,
    path: string,
    known: ReadonlySet<string>,
  ): void {
    for (const name of Object.keys(group)) {
      if (!known.has(name)) {
        this.problems.push({ code: "unknown", path: path === "" ? name : `${path}.${name}` });
      }
    }
  }

  private groupHasProblem(path: string): boolean {
    return this.problems.some((problem) => problem.code === "invalid" && problem.path === path);
  }
}
