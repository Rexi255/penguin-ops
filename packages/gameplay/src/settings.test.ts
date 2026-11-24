import { describe, expect, test } from "vitest";

import {
  COLOR_SCHEMES,
  DEFAULT_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  gameLanguage,
  LANGUAGE_SETTINGS,
  migrateSettings,
  parseSettings,
  REDUCE_MOTION_SETTINGS,
  SETTINGS_FORMAT_NAME,
  SETTINGS_FORMAT_VERSION,
  SETTINGS_MIGRATIONS,
  type Settings,
  type SettingsMigration,
  serializeSettings,
  VOLUME_MAX,
  VOLUME_MIN,
} from "./settings";

/** The stored example settings files of every format version, by file name (`v1.json`, …). */
const FIXTURES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../settings-fixtures/*.json", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).map(([path, text]) => [path.replace("../settings-fixtures/", ""), text]),
);

/** Settings that differ from the defaults in every setting. */
const SETTINGS: Settings = {
  language: "de",
  volumes: { master: 65, music: 0, effects: 100 },
  fullscreen: false,
  fontSize: 125,
  colorScheme: "high-contrast",
  effects: { glow: true, scanlines: false },
  reduceMotion: "on",
};

/** The settings file of `SETTINGS` as a JSON object, to break one field at a time. */
function settingsFile(): Record<string, unknown> {
  return JSON.parse(serializeSettings(SETTINGS)) as Record<string, unknown>;
}

/** Parses `value` written as JSON. */
function parse(value: unknown) {
  return parseSettings(JSON.stringify(value));
}

describe("DEFAULT_SETTINGS", () => {
  test("follow the system's language and motion setting and start in fullscreen", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      language: "system",
      volumes: { master: 80, music: 50, effects: 80 },
      fullscreen: true,
      fontSize: 100,
      colorScheme: "default",
      effects: { glow: false, scanlines: false },
      reduceMotion: "system",
    });
  });

  test("are read back unchanged from their own file", () => {
    expect(parseSettings(serializeSettings(DEFAULT_SETTINGS))).toEqual({
      settings: DEFAULT_SETTINGS,
      problems: [],
    });
  });
});

describe("serializeSettings", () => {
  test("writes every setting in a fixed order with the format and version first", () => {
    expect(serializeSettings(SETTINGS)).toBe(
      `${JSON.stringify(
        {
          format: SETTINGS_FORMAT_NAME,
          version: SETTINGS_FORMAT_VERSION,
          language: "de",
          volumes: { master: 65, music: 0, effects: 100 },
          fullscreen: false,
          fontSize: 125,
          colorScheme: "high-contrast",
          effects: { glow: true, scanlines: false },
          reduceMotion: "on",
        },
        undefined,
        2,
      )}\n`,
    );
  });

  test("gives the same text for the same settings in any key order", () => {
    const reordered: Settings = {
      reduceMotion: SETTINGS.reduceMotion,
      effects: { scanlines: SETTINGS.effects.scanlines, glow: SETTINGS.effects.glow },
      colorScheme: SETTINGS.colorScheme,
      fontSize: SETTINGS.fontSize,
      fullscreen: SETTINGS.fullscreen,
      volumes: {
        effects: SETTINGS.volumes.effects,
        music: SETTINGS.volumes.music,
        master: SETTINGS.volumes.master,
      },
      language: SETTINGS.language,
    };
    expect(serializeSettings(reordered)).toBe(serializeSettings(SETTINGS));
  });
});

describe("parseSettings", () => {
  test("reads the settings it wrote without a problem", () => {
    expect(parseSettings(serializeSettings(SETTINGS))).toEqual({
      settings: SETTINGS,
      problems: [],
    });
  });

  test.each(["", "{", "settings", "{ language: 'de' }"])(
    "uses the default settings for the text %j that is no JSON",
    (text) => {
      expect(parseSettings(text)).toEqual({
        settings: DEFAULT_SETTINGS,
        problems: [{ code: "not-json" }],
      });
    },
  );

  test.each([
    ["null", null],
    ["an array", [settingsFile()]],
    ["a string", SETTINGS_FORMAT_NAME],
    ["an object without format", { ...settingsFile(), format: undefined }],
    ["a save file", { ...settingsFile(), format: "penguin-ops-save" }],
  ])("uses the default settings for %s", (_name, value) => {
    expect(parse(value)).toEqual({
      settings: DEFAULT_SETTINGS,
      problems: [{ code: "not-settings" }],
    });
  });

  test.each([
    ["missing", undefined],
    ["zero", 0],
    ["a fraction", 1.5],
    ["a string", "1"],
  ])("uses the default settings for a version that is %s", (_name, version) => {
    expect(parse({ ...settingsFile(), version })).toEqual({
      settings: DEFAULT_SETTINGS,
      problems: [
        { code: "invalid", path: "version", message: "the version must be a whole number from 1" },
      ],
    });
  });

  test("uses the default settings for a file of a newer version", () => {
    const version = SETTINGS_FORMAT_VERSION + 1;
    expect(parse({ ...settingsFile(), version })).toEqual({
      settings: DEFAULT_SETTINGS,
      problems: [{ code: "too-new", version }],
    });
  });

  test("keeps the other settings when one breaks the format", () => {
    expect(parse({ ...settingsFile(), fontSize: "large" })).toEqual({
      settings: { ...SETTINGS, fontSize: DEFAULT_SETTINGS.fontSize },
      problems: [
        { code: "invalid", path: "fontSize", message: "the font size must be a whole number" },
      ],
    });
  });

  test("gives every setting that is missing its default", () => {
    const file = settingsFile();
    delete file["language"];
    delete file["reduceMotion"];
    expect(parse(file)).toEqual({
      settings: {
        ...SETTINGS,
        language: DEFAULT_SETTINGS.language,
        reduceMotion: DEFAULT_SETTINGS.reduceMotion,
      },
      problems: [
        { code: "invalid", path: "language", message: "the setting is missing" },
        { code: "invalid", path: "reduceMotion", message: "the setting is missing" },
      ],
    });
  });

  test("reads every setting of a group on its own", () => {
    const file = {
      ...settingsFile(),
      volumes: { master: 65, music: 101, effects: 100 },
      effects: { glow: "yes" },
    };
    expect(parse(file)).toEqual({
      settings: {
        ...SETTINGS,
        volumes: { ...SETTINGS.volumes, music: DEFAULT_SETTINGS.volumes.music },
        effects: {
          glow: DEFAULT_SETTINGS.effects.glow,
          scanlines: DEFAULT_SETTINGS.effects.scanlines,
        },
      },
      problems: [
        {
          code: "invalid",
          path: "volumes.music",
          message: `a volume cannot be above ${String(VOLUME_MAX)}`,
        },
        { code: "invalid", path: "effects.glow", message: "the setting must be true or false" },
        { code: "invalid", path: "effects.scanlines", message: "the setting is missing" },
      ],
    });
  });

  test.each([
    ["missing", undefined, "the group of settings is missing"],
    ["no object", 80, "the settings must be an object"],
    ["an array", [80, 50, 80], "the settings must be an object"],
  ])("gives every volume its default when the group is %s", (_name, volumes, message) => {
    expect(parse({ ...settingsFile(), volumes })).toEqual({
      settings: { ...SETTINGS, volumes: DEFAULT_SETTINGS.volumes },
      problems: [{ code: "invalid", path: "volumes", message }],
    });
  });

  test("ignores fields it does not know and reports them", () => {
    const file = {
      ...settingsFile(),
      theme: "light",
      volumes: { ...SETTINGS.volumes, voice: 30 },
      effects: { ...SETTINGS.effects, blur: true },
    };
    expect(parse(file)).toEqual({
      settings: SETTINGS,
      problems: [
        { code: "unknown", path: "theme" },
        { code: "unknown", path: "volumes.voice" },
        { code: "unknown", path: "effects.blur" },
      ],
    });
  });

  test("does not take a setting from the object's prototype", () => {
    const text = serializeSettings(SETTINGS).replace(
      '"fullscreen": false,',
      '"__proto__": { "fullscreen": false },',
    );
    expect(parseSettings(text)).toEqual({
      settings: { ...SETTINGS, fullscreen: DEFAULT_SETTINGS.fullscreen },
      problems: [
        { code: "invalid", path: "fullscreen", message: "the setting is missing" },
        { code: "unknown", path: "__proto__" },
      ],
    });
  });

  describe("the values of each setting", () => {
    test.each(LANGUAGE_SETTINGS)("accepts the language %s", (language) => {
      expect(parse({ ...settingsFile(), language }).settings.language).toBe(language);
    });

    test.each(["fr", "DE", "de-DE", "", 1])("refuses the language %j", (language) => {
      expect(parse({ ...settingsFile(), language }).problems).toEqual([
        {
          code: "invalid",
          path: "language",
          message: "the language must be one of system, en, de",
        },
      ]);
    });

    test.each([VOLUME_MIN, 1, 50, VOLUME_MAX])("accepts the volume %d", (volume) => {
      const volumes = { master: volume, music: volume, effects: volume };
      expect(parse({ ...settingsFile(), volumes })).toEqual({
        settings: { ...SETTINGS, volumes },
        problems: [],
      });
    });

    test.each([
      [-1, `a volume cannot be below ${String(VOLUME_MIN)}`],
      [VOLUME_MAX + 1, `a volume cannot be above ${String(VOLUME_MAX)}`],
      [12.5, "a volume must be a whole number"],
      ["80", "a volume must be a whole number"],
      [null, "a volume must be a whole number"],
    ])("refuses the volume %j", (master, message) => {
      const file = { ...settingsFile(), volumes: { ...SETTINGS.volumes, master } };
      expect(parse(file).problems).toEqual([{ code: "invalid", path: "volumes.master", message }]);
    });

    test.each([FONT_SIZE_MIN, 100, 133, FONT_SIZE_MAX])("accepts the font size %d", (fontSize) => {
      expect(parse({ ...settingsFile(), fontSize }).settings.fontSize).toBe(fontSize);
    });

    test.each([
      [FONT_SIZE_MIN - 1, `the font size cannot be below ${String(FONT_SIZE_MIN)}`],
      [FONT_SIZE_MAX + 1, `the font size cannot be above ${String(FONT_SIZE_MAX)}`],
      [110.5, "the font size must be a whole number"],
    ])("refuses the font size %j", (fontSize, message) => {
      expect(parse({ ...settingsFile(), fontSize }).problems).toEqual([
        { code: "invalid", path: "fontSize", message },
      ]);
    });

    test.each([true, false])("accepts fullscreen %s", (fullscreen) => {
      expect(parse({ ...settingsFile(), fullscreen }).settings.fullscreen).toBe(fullscreen);
    });

    test.each(["true", 1, null])("refuses fullscreen %j", (fullscreen) => {
      expect(parse({ ...settingsFile(), fullscreen }).problems).toEqual([
        { code: "invalid", path: "fullscreen", message: "the setting must be true or false" },
      ]);
    });

    test.each(COLOR_SCHEMES)("accepts the colour scheme %s", (colorScheme) => {
      expect(parse({ ...settingsFile(), colorScheme }).settings.colorScheme).toBe(colorScheme);
    });

    test("refuses a colour scheme it does not know", () => {
      expect(parse({ ...settingsFile(), colorScheme: "light" }).problems).toEqual([
        {
          code: "invalid",
          path: "colorScheme",
          message: "the colour scheme must be one of default, retro-crt, solarized, high-contrast",
        },
      ]);
    });

    test.each(REDUCE_MOTION_SETTINGS)("accepts reduce motion %s", (reduceMotion) => {
      expect(parse({ ...settingsFile(), reduceMotion }).settings.reduceMotion).toBe(reduceMotion);
    });

    test.each([true, "yes"])("refuses reduce motion %j", (reduceMotion) => {
      expect(parse({ ...settingsFile(), reduceMotion }).problems).toEqual([
        {
          code: "invalid",
          path: "reduceMotion",
          message: "reduce motion must be one of system, on, off",
        },
      ]);
    });
  });
});

describe("migrateSettings", () => {
  const migrations: readonly SettingsMigration[] = [
    { from: 1, migrate: (file) => ({ ...file, fontSize: 110 }) },
    { from: 2, migrate: ({ fontSize, ...file }) => ({ ...file, textSize: fontSize }) },
  ];

  test("runs every migration from the file's version to the target, one at a time", () => {
    expect(migrateSettings({ format: SETTINGS_FORMAT_NAME, version: 1 }, 1, 3, migrations)).toEqual(
      { format: SETTINGS_FORMAT_NAME, version: 3, textSize: 110 },
    );
  });

  test("starts at the file's version", () => {
    expect(migrateSettings({ version: 2, fontSize: 90 }, 2, 3, migrations)).toEqual({
      version: 3,
      textSize: 90,
    });
  });

  test("leaves a file of the target version alone", () => {
    const file = { version: 3 };
    expect(migrateSettings(file, 3, 3, migrations)).toBe(file);
  });

  test("throws if a migration is missing", () => {
    expect(() => migrateSettings({ version: 1 }, 1, 4, migrations)).toThrow(
      "There is no settings migration from version 3.",
    );
  });
});

describe("the settings format's history", () => {
  test("has one migration for every version before the current one, in order", () => {
    expect(SETTINGS_MIGRATIONS.map((migration) => migration.from)).toEqual(
      Array.from({ length: SETTINGS_FORMAT_VERSION - 1 }, (_, index) => index + 1),
    );
  });

  test("has a stored example file of every version", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(
      Array.from({ length: SETTINGS_FORMAT_VERSION }, (_, index) => `v${String(index + 1)}.json`),
    );
  });

  test.each(Object.entries(FIXTURES))(
    "reads the stored example file %s without a problem",
    (_name, text) => {
      expect(parseSettings(text).problems).toEqual([]);
    },
  );

  test("writes the example file of the current version byte for byte as it is stored", () => {
    const text = FIXTURES[`v${String(SETTINGS_FORMAT_VERSION)}.json`] ?? "";
    expect(serializeSettings(parseSettings(text).settings)).toBe(text);
  });
});

describe("gameLanguage", () => {
  test.each(["de", "en"] as const)(
    "takes the chosen language %s whatever the system's",
    (language) => {
      expect(gameLanguage(language, "de-DE")).toBe(language);
      expect(gameLanguage(language, "en-US")).toBe(language);
    },
  );

  test.each(["de", "de-DE", "de-AT", "de-CH", "DE-de"])(
    "takes German from the system's locale %s",
    (locale) => {
      expect(gameLanguage("system", locale)).toBe("de");
    },
  );

  test.each(["en", "en-US", "en-GB", "fr-FR", "pt-BR", "dev", "", "nl-DE"])(
    "takes English from the system's locale %j",
    (locale) => {
      expect(gameLanguage("system", locale)).toBe("en");
    },
  );
});
