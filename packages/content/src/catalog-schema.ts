// Schemas of the translation catalogs (ADR 0012, ADR 0071): a level's texts in
// `content/levels/<level-id>/<language>.yaml` and the general UI texts in
// `content/ui/<language>.yaml`, described in docs/LEVEL-AUTHORING.md.
//
// English and German are mandatory and must be complete, so their level catalogs need every
// field of the level's own texts. Further languages may be incomplete: their level catalogs use
// the partial schema, and missing texts fall back to English (ROADMAP M2.3d).
//
// What a single catalog cannot show is checked elsewhere: which catalog files exist (content
// loader) and whether a catalog holds exactly the keys that its level needs (content tests,
// ROADMAP M2.4). ICU MessageFormat and the text markup are checked in ROADMAP M2.3b and M2.3c.

import { z } from "zod";

import { RESERVED_TEXT_KEYS, TEXT_KEY_PATTERN } from "./level-schema";

/** The languages that every level and the UI must have, complete (ADR 0012). */
export const MANDATORY_LANGUAGES = ["en", "de"] as const;

export type MandatoryLanguage = (typeof MANDATORY_LANGUAGES)[number];

/**
 * Language codes of catalog files: a lowercase ISO 639 language code, optionally followed by a
 * lowercase region, for example `de`, `en` or `pt-br`.
 */
export const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[a-z]{2})?$/u;

/** English names of the mandatory languages, for messages. */
export const LANGUAGE_NAMES: Readonly<Record<MandatoryLanguage, string>> = {
  en: "English",
  de: "German",
};

/** Whether a language is one of the mandatory languages. */
export function isMandatoryLanguage(language: string): language is MandatoryLanguage {
  return (MANDATORY_LANGUAGES as readonly string[]).includes(language);
}

/** The catalogs of a level or of the UI, one per language. */
export interface Catalogs<Complete, Partial> {
  readonly en: Complete;
  readonly de: Complete;
  /** Further languages by language code; they may be incomplete. */
  readonly extra: ReadonlyMap<string, Partial>;
}

/** A row of an explanation's option table: the option and what it does. */
export type LevelOption = readonly [option: string, description: string];

/** The explanation shown after a level is solved. */
export interface LevelExplanation {
  readonly text: string;
  /** Options of the taught command, possibly none. */
  readonly options: readonly LevelOption[];
  /** A command to try. */
  readonly example?: string;
}

/** The three hints of a level: a tip, a concrete tip and the solution. */
export type LevelHints = readonly [tip: string, concreteTip: string, solution: string];

/** A complete level catalog: all texts of a level in one language. */
export interface LevelCatalog {
  readonly title: string;
  readonly ticket: string;
  readonly hints: LevelHints;
  readonly explanation: LevelExplanation;
  /** Descriptions of the extra goals by their ID. */
  readonly extraGoals: ReadonlyMap<string, string>;
  /** Every other text by its key: tips, step messages and prose file contents. */
  readonly texts: ReadonlyMap<string, string>;
}

/** A level catalog of a further language, which may lack texts. */
export interface PartialLevelCatalog {
  readonly title?: string;
  readonly ticket?: string;
  readonly hints?: LevelHints;
  readonly explanation?: {
    readonly text?: string;
    readonly options?: readonly LevelOption[];
    readonly example?: string;
  };
  readonly extraGoals: ReadonlyMap<string, string>;
  readonly texts: ReadonlyMap<string, string>;
}

/** The general UI texts of one language by their dotted keys, for example `menu.new-game`. */
export type UiCatalog = ReadonlyMap<string, string>;

/** Pattern of extra goal IDs, like `idSchema` in the level schema. */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** The keys of a level catalog that are not free text keys. */
const LEVEL_CATALOG_FIELDS: readonly string[] = [...RESERVED_TEXT_KEYS, "extra_goals"];

/**
 * Runs a key check also when values inside the map have problems (an empty text, two hints),
 * which zod would otherwise skip, so that more problems of a file are reported together. zod
 * still skips it after a value of the wrong type.
 */
const KEY_CHECK = { when: (payload: { readonly value: unknown }) => isMap(payload.value) };

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const textSchema = z
  .string({ error: "a text must be a string" })
  .refine((text) => text.trim() !== "", { error: "a text must not be empty" });

const hintsSchema = z
  .array(textSchema, { error: "hints are a list of three texts" })
  // A refinement, not .length(): zod would also check the length of a string given instead.
  .refine((hints) => hints.length === 3, {
    error: "a level has exactly three hints: a tip, a concrete tip and the solution",
  })
  .transform((hints): LevelHints => [hints[0] ?? "", hints[1] ?? "", hints[2] ?? ""]);

const optionSchema = z
  .array(textSchema, { error: "an option is a pair: [option, description]" })
  .refine((pair) => pair.length === 2, { error: "an option is a pair: [option, description]" })
  .transform((pair): LevelOption => [pair[0] ?? "", pair[1] ?? ""]);

const extraGoalTextsSchema = z
  .record(z.string(), textSchema, {
    error: "extra_goals is a map of extra goal IDs and their descriptions",
  })
  .superRefine((goals, context) => {
    for (const id of Object.keys(goals)) {
      if (!ID_PATTERN.test(id)) {
        context.addIssue({
          code: "custom",
          path: [id],
          message:
            "an extra goal ID must be kebab-case: lowercase letters and digits, separated by single hyphens",
        });
      }
    }
  }, KEY_CHECK)
  .transform((goals): ReadonlyMap<string, string> => new Map(Object.entries(goals)));

const completeExplanationSchema = z.strictObject({
  text: textSchema,
  options: z.array(optionSchema).default([]),
  example: textSchema.optional(),
});

const partialExplanationSchema = z.strictObject({
  text: textSchema.optional(),
  options: z.array(optionSchema).optional(),
  example: textSchema.optional(),
});

/** Reports every free key that is not a valid text key. */
function checkTextKeys(catalog: Record<string, unknown>, context: z.RefinementCtx): void {
  for (const key of Object.keys(catalog)) {
    if (!LEVEL_CATALOG_FIELDS.includes(key) && !TEXT_KEY_PATTERN.test(key)) {
      context.addIssue({
        code: "custom",
        path: [key],
        message:
          "a text key must be kebab-case and start with a letter, for example tip-wrong-printer",
      });
    }
  }
}

/** The free texts of a checked catalog. */
function freeTexts(catalog: Record<string, unknown>): ReadonlyMap<string, string> {
  const texts = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    if (!LEVEL_CATALOG_FIELDS.includes(key) && typeof value === "string") {
      texts.set(key, value);
    }
  }
  return texts;
}

/** Schema of a level catalog of English or German: every field of the level's texts. */
export const levelCatalogSchema: z.ZodType<LevelCatalog> = z
  .object({
    title: textSchema,
    ticket: textSchema,
    hints: hintsSchema,
    explanation: completeExplanationSchema,
    extra_goals: extraGoalTextsSchema.prefault({}),
  })
  .catchall(textSchema)
  .superRefine(checkTextKeys, KEY_CHECK)
  .transform((catalog): LevelCatalog => ({
    title: catalog.title,
    ticket: catalog.ticket,
    hints: catalog.hints,
    explanation: {
      text: catalog.explanation.text,
      options: catalog.explanation.options,
      ...(catalog.explanation.example === undefined
        ? {}
        : { example: catalog.explanation.example }),
    },
    extraGoals: catalog.extra_goals,
    texts: freeTexts(catalog),
  }));

/** Schema of a level catalog of a further language: like English, but every text optional. */
export const partialLevelCatalogSchema: z.ZodType<PartialLevelCatalog> = z
  .object({
    title: textSchema.optional(),
    ticket: textSchema.optional(),
    hints: hintsSchema.optional(),
    explanation: partialExplanationSchema.optional(),
    extra_goals: extraGoalTextsSchema.prefault({}),
  })
  .catchall(textSchema)
  .superRefine(checkTextKeys, KEY_CHECK)
  .transform((catalog): PartialLevelCatalog => {
    const { explanation } = catalog;
    return {
      ...(catalog.title === undefined ? {} : { title: catalog.title }),
      ...(catalog.ticket === undefined ? {} : { ticket: catalog.ticket }),
      ...(catalog.hints === undefined ? {} : { hints: catalog.hints }),
      ...(explanation === undefined
        ? {}
        : {
            explanation: {
              ...(explanation.text === undefined ? {} : { text: explanation.text }),
              ...(explanation.options === undefined ? {} : { options: explanation.options }),
              ...(explanation.example === undefined ? {} : { example: explanation.example }),
            },
          }),
      extraGoals: catalog.extra_goals,
      texts: freeTexts(catalog),
    };
  });

/** A group of UI texts as the YAML file holds it: texts and nested groups by key. */
interface UiGroup {
  readonly [key: string]: string | UiGroup;
}

const uiGroupSchema: z.ZodType<UiGroup> = z.lazy(() =>
  z
    .record(
      z.string(),
      z.union([textSchema, uiGroupSchema], {
        error: "a UI entry is a text or a group of texts",
      }),
      { error: "UI texts are a map of keys and texts or groups of texts" },
    )
    .superRefine((group, context) => {
      const keys = Object.keys(group);
      if (keys.length === 0) {
        context.addIssue({ code: "custom", message: "a group of UI texts must not be empty" });
      }
      for (const key of keys) {
        if (!TEXT_KEY_PATTERN.test(key)) {
          context.addIssue({
            code: "custom",
            path: [key],
            message:
              "a UI text key must be kebab-case and start with a letter, for example new-game",
          });
        }
      }
    }, KEY_CHECK),
);

/**
 * Schema of a UI catalog `content/ui/<language>.yaml`: texts, grouped in nested maps. The
 * result holds every text by its dotted key, for example `menu.new-game`.
 */
export const uiCatalogSchema: z.ZodType<UiCatalog> = uiGroupSchema.transform((root): UiCatalog => {
  const texts = new Map<string, string>();
  const collect = (group: UiGroup, prefix: string): void => {
    for (const [key, value] of Object.entries(group)) {
      if (typeof value === "string") {
        texts.set(`${prefix}${key}`, value);
      } else {
        collect(value, `${prefix}${key}.`);
      }
    }
  };
  collect(root, "");
  return texts;
});
