// Level schema v1 (ADR 0010, ADR 0068): the format of `content/levels/<level-id>/level.yaml`,
// described in docs/LEVEL-AUTHORING.md. Parsing checks a level that the YAML parser has read
// and turns it into a `Level`: rules become the engine's rules, file modes become numbers and
// the start files a list. The JSON Schema for editors is generated from this schema
// (`level-json-schema.ts`).
//
// What the schema cannot see is checked later: that the folder name is the level ID, the
// world and host exist, owners and groups exist on the host, text keys exist in the catalogs
// and the commands in `teaches` exist (loader, content tests and level session in ROADMAP M2).

import type { Rule } from "@penguin-ops/engine";
import { z } from "zod";

import { rulePathSchema, ruleSchema } from "./rule-schema";

/** The level format version that this schema reads. */
export const LEVEL_FORMAT_VERSION = 1;

/** The kinds of levels (ADR 0017). */
export const LEVEL_KINDS = ["main", "review", "side", "incident"] as const;

export type LevelKind = (typeof LEVEL_KINDS)[number];

/** XP for solving a level that does not say otherwise. */
export const DEFAULT_LEVEL_XP = 100;

/**
 * Keys that the text catalogs use for the level's own texts (ticket, hints, explanation), so
 * that level.yaml cannot use them for file contents, tips or steps.
 */
export const RESERVED_TEXT_KEYS = ["title", "ticket", "hints", "explanation"] as const;

/** Where the content of a start file comes from. */
export type FileSource =
  /** Literal content, technical and always English. */
  | { readonly kind: "content"; readonly content: string }
  /** Prose from the text catalogs, translated. */
  | { readonly kind: "text"; readonly key: string };

/** Owner, group and permission bits of a start file or directory; unset means the default. */
export interface StartAttributes {
  /** Name of the owning user. */
  readonly owner?: string;
  /** Name of the owning group. */
  readonly group?: string;
  /** Permission bits as a number, for example 0o640. */
  readonly mode?: number;
}

/** A file or directory that the level creates at the start. */
export type StartEntry =
  | (StartAttributes & {
      readonly kind: "file";
      /** Absolute or starting with `~/`. */
      readonly path: string;
      readonly source: FileSource;
    })
  | (StartAttributes & {
      readonly kind: "directory";
      /** Absolute or starting with `~/`, without the trailing slash of the YAML key. */
      readonly path: string;
    });

/** How the level's session starts. */
export interface LevelStart {
  /** The host the session starts on; unset means the world's default host. */
  readonly host?: string;
  /** The start directory: absolute, `~` or starting with `~/`. */
  readonly cwd: string;
  /** Files and directories to create, in the order of the level file. */
  readonly files: readonly StartEntry[];
}

/** One step of a multi-step ticket. */
export interface LevelStep {
  /** Stable ID, unique in the level; save files store the last completed step. */
  readonly id: string;
  /** The rule that completes the step. */
  readonly goal: Rule;
  /** Text key of a message shown when the step is completed. */
  readonly say?: string;
}

/** A tip for a typical mistake, shown once when its rule becomes true. */
export interface LevelTip {
  readonly when: Rule;
  /** Text key of the tip. */
  readonly say: string;
}

/** An optional bonus goal. */
export interface ExtraGoal {
  /** Stable ID, unique in the level; its description is `extra_goals.<id>` in the catalogs. */
  readonly id: string;
  readonly when: Rule;
  readonly xp: number;
}

interface LevelFields {
  readonly format: typeof LEVEL_FORMAT_VERSION;
  /** Stable kebab-case ID, the name of the level's folder. */
  readonly id: string;
  readonly kind: LevelKind;
  /** Commands the level introduces (for `review` levels: the commands it practises). */
  readonly teaches: readonly string[];
  readonly xp: number;
  /** Base world from `content/worlds/`; unset means the standard office world. */
  readonly world?: string;
  readonly start: LevelStart;
  readonly tips: readonly LevelTip[];
  readonly extraGoals: readonly ExtraGoal[];
  /** Reference solutions: each a list of command lines. */
  readonly solutions: readonly (readonly string[])[];
}

/** A checked level: one goal, or steps for a multi-step ticket. */
export type Level = LevelFields &
  (
    | { readonly goal: Rule; readonly steps?: never }
    | { readonly steps: readonly LevelStep[]; readonly goal?: never }
  );

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TEXT_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9._+-]*$/u;
/** Host names as the engine allows them (ADR 0009). */
const HOST_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
/** User and group names as the engine allows them. */
const ACCOUNT_NAME_PATTERN = /^[^\s:/]+$/u;
/** Permission bits as `ls -l` shows them, with setuid, setgid and sticky. */
const MODE_PATTERN = /^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/u;

/** A string schema for a stable kebab-case ID; `what` names the ID in the message. */
export function idSchema(what: string) {
  return z.string().regex(ID_PATTERN, {
    error: `${what} must be kebab-case: lowercase letters and digits, separated by single hyphens`,
  });
}

const textKeySchema = z
  .string()
  .regex(TEXT_KEY_PATTERN, {
    error: "a text key must be kebab-case and start with a letter, for example tip-wrong-printer",
  })
  .refine((key) => !(RESERVED_TEXT_KEYS as readonly string[]).includes(key), {
    error: `a text key must not be one of the catalog's own keys: ${RESERVED_TEXT_KEYS.join(", ")}`,
  })
  .meta({ description: "A key of the level's text catalogs (de.yaml, en.yaml)." });

const modeSchema = z
  .string()
  .regex(MODE_PATTERN, {
    error: 'a mode is written like ls -l shows it, for example "rw-r-----"',
  })
  .transform(parseMode)
  .meta({ description: 'Permission bits like ls -l shows them, for example "rw-r-----".' });

const accountNameSchema = z.string().regex(ACCOUNT_NAME_PATTERN, {
  error: "a user or group name must not be empty or contain spaces, colons or slashes",
});

const fileObjectSchema = z
  .strictObject({
    content: z
      .string()
      .meta({ description: "Literal content: technical, always English." })
      .optional(),
    text: textKeySchema
      .meta({ description: "Prose content: a key of the level's text catalogs." })
      .optional(),
    owner: accountNameSchema.meta({ description: "Name of the owning user." }).optional(),
    group: accountNameSchema.meta({ description: "Name of the owning group." }).optional(),
    mode: modeSchema.optional(),
  })
  .meta({ not: { required: ["content", "text"] } });

const startFileValueSchema = z
  .union(
    [
      z.string().meta({ description: "Literal content of a file: technical, always English." }),
      fileObjectSchema,
    ],
    {
      error:
        "a start file is its content (a string) or an object with content or text; a directory is {} or an object with owner, group and mode",
    },
  )
  .meta({
    description:
      'A file (literal content, { text: key } or { content, owner, group, mode }) or, for a path that ends with "/", a directory ({} or { owner, group, mode }).',
  });

// The paths are checked together with the values below: zod would replace the message of a
// key check with a general "Invalid key in record".
const startFilesSchema = z
  .record(
    z.string().meta({
      description:
        'An absolute path or a path that starts with "~/"; a directory if it ends with "/".',
      pattern: "^(?:/|~/)",
    }),
    startFileValueSchema,
  )
  .superRefine((files, context) => {
    checkStartFiles(files, (path, message) => {
      context.addIssue({ code: "custom", path: [path], message });
    });
  })
  .transform((files) => Object.entries(files).map(([path, value]) => toStartEntry(path, value)));

type StartFileValue = z.output<typeof startFileValueSchema>;

const startSchema = z
  .strictObject({
    host: z
      .string()
      .regex(HOST_NAME_PATTERN, { error: "not a valid host name" })
      .meta({ description: "The host the session starts on. Default: the world's default host." })
      .optional(),
    cwd: rulePathSchema
      .default("~")
      .meta({ description: 'The start directory. Default: "~", the player\'s home.' }),
    files: startFilesSchema
      .prefault({})
      .meta({ description: "Files and directories to create, by path." }),
  })
  .transform((start): LevelStart => ({
    ...(start.host === undefined ? {} : { host: start.host }),
    cwd: start.cwd,
    files: start.files,
  }));

const stepSchema = z
  .strictObject({
    id: idSchema("a step ID").meta({ description: "Stable ID of the step, unique in the level." }),
    goal: ruleSchema,
    say: textKeySchema
      .meta({ description: "Text key of a message shown when the step is completed." })
      .optional(),
  })
  .transform((step): LevelStep => ({
    id: step.id,
    goal: step.goal,
    ...(step.say === undefined ? {} : { say: step.say }),
  }));

const tipSchema = z.strictObject({
  when: ruleSchema,
  say: textKeySchema.meta({ description: "Text key of the tip." }),
});

const extraGoalSchema = z.strictObject({
  id: idSchema("an extra goal ID").meta({
    description: "Stable ID, unique in the level; the catalogs describe it as extra_goals.<id>.",
  }),
  when: ruleSchema,
  xp: z.int().positive().meta({ description: "XP for reaching the extra goal." }),
});

const commandLineSchema = z
  .string()
  .refine((line) => line.trim() !== "", { error: "a command line must not be empty" })
  .refine((line) => !/[\n\r]/u.test(line), {
    error: "a command line must not contain a line break; write one command line per entry",
  });

const levelObjectSchema = z
  .strictObject({
    format: z
      .literal(LEVEL_FORMAT_VERSION, {
        error: `the level format version must be ${String(LEVEL_FORMAT_VERSION)}`,
      })
      .meta({ description: "Level format version." }),
    id: idSchema("a level ID").meta({
      description: "Stable level ID; must match the folder name and never change.",
    }),
    kind: z.enum(LEVEL_KINDS).meta({ description: "The kind of level." }),
    teaches: z
      .array(z.string().regex(COMMAND_NAME_PATTERN, { error: "not a valid command name" }))
      .min(1, { error: "a level teaches or practises at least one command" })
      .superRefine((commands, context) => {
        reportDuplicates(commands, "the command", context);
      })
      .meta({ description: "Commands introduced (for review levels: commands practised)." }),
    xp: z
      .int()
      .positive()
      .default(DEFAULT_LEVEL_XP)
      .meta({ description: `XP for solving. Default: ${String(DEFAULT_LEVEL_XP)}.` }),
    world: idSchema("a world ID")
      .meta({ description: "Base world from content/worlds/. Default: the standard office world." })
      .optional(),
    start: startSchema.prefault({}),
    goal: ruleSchema.optional(),
    steps: z
      .array(stepSchema)
      .min(2, { error: "a multi-step ticket has at least two steps; use goal for one" })
      .superRefine((steps, context) => {
        reportDuplicates(
          steps.map((step) => step.id),
          "the step ID",
          context,
          (index) => [index, "id"],
        );
      })
      .meta({ description: "Steps of a multi-step ticket, instead of goal." })
      .optional(),
    tips: z.array(tipSchema).default([]).meta({ description: "Tips, each shown once." }),
    extra_goals: z
      .array(extraGoalSchema)
      .default([])
      .superRefine((goals, context) => {
        reportDuplicates(
          goals.map((goal) => goal.id),
          "the extra goal ID",
          context,
          (index) => [index, "id"],
        );
      })
      .meta({ description: "Optional bonus goals." }),
    solutions: z
      .array(z.array(commandLineSchema).min(1, { error: "a reference solution needs a command" }))
      .min(1, { error: "a level needs at least one reference solution" })
      .meta({ description: "Reference solutions, each a list of command lines." }),
  })
  .meta({ oneOf: [{ required: ["goal"] }, { required: ["steps"] }] });

/** Schema of a `level.yaml` file: checks the parsed YAML and turns it into a `Level`. */
export const levelSchema = levelObjectSchema
  .superRefine((level, context) => {
    if ((level.goal === undefined) === (level.steps === undefined)) {
      context.addIssue({
        code: "custom",
        message:
          level.goal === undefined
            ? "a level needs either goal or steps"
            : "a level has either goal or steps, not both",
      });
    }
  })
  .transform((level): Level => {
    const fields: LevelFields = {
      format: level.format,
      id: level.id,
      kind: level.kind,
      teaches: level.teaches,
      xp: level.xp,
      ...(level.world === undefined ? {} : { world: level.world }),
      start: level.start,
      tips: level.tips,
      extraGoals: level.extra_goals,
      solutions: level.solutions,
    };
    if (level.goal !== undefined) {
      return { ...fields, goal: level.goal };
    }
    // The superRefine check runs first, so a level without a goal has steps.
    return { ...fields, steps: level.steps ?? [] };
  })
  .meta({
    title: "PenguinOps level",
    description: "A level of PenguinOps: content/levels/<level-id>/level.yaml.",
  });

/** The form of a `level.yaml` file as the YAML parser reads it. */
export type LevelInput = z.input<typeof levelSchema>;

/** Why a key of `start.files` is not a valid path, or `undefined` if it is. */
function startPathProblem(path: string): string | undefined {
  if (!path.startsWith("/") && !path.startsWith("~/")) {
    return 'a start file path must be absolute or start with "~/" (the player\'s home)';
  }
  const components = path.slice(path.startsWith("/") ? 1 : 2).split("/");
  if (components.at(-1) === "") {
    components.pop();
  }
  if (components.length === 0) {
    return "a start file path must name a file or directory below the root or the home";
  }
  if (components.some((component) => component === "" || component === "." || component === "..")) {
    return 'a start file path must not contain empty components, "." or ".."';
  }
  return undefined;
}

/**
 * Checks the start files together: every path is valid, a directory path takes no content, a
 * file path needs one, a path is not both a file and a directory, and nothing lies inside a
 * file.
 */
function checkStartFiles(
  files: Readonly<Record<string, StartFileValue>>,
  report: (path: string, message: string) => void,
): void {
  const filePaths = new Set<string>();
  const paths: string[] = [];
  for (const path of Object.keys(files)) {
    const problem = startPathProblem(path);
    if (problem === undefined) {
      paths.push(path);
    } else {
      report(path, problem);
    }
  }
  for (const path of paths) {
    const value = files[path];
    if (isDirectoryPath(path)) {
      if (typeof value === "string" || value?.content !== undefined || value?.text !== undefined) {
        report(path, 'a directory (path ending with "/") has no content or text');
      }
    } else {
      filePaths.add(path);
      if (typeof value === "object" && value.content === undefined && value.text === undefined) {
        report(path, 'a file needs content or text; end the path with "/" for a directory');
      }
      if (typeof value === "object" && value.content !== undefined && value.text !== undefined) {
        report(path, "a file has either content or text, not both");
      }
    }
  }
  for (const path of paths) {
    const bare = withoutTrailingSlash(path);
    if (isDirectoryPath(path) && filePaths.has(bare)) {
      report(path, `"${bare}" is both a file and a directory`);
    }
    for (const filePath of filePaths) {
      if (bare.startsWith(`${filePath}/`)) {
        report(path, `"${path}" lies inside the file "${filePath}"`);
      }
    }
  }
}

function toStartEntry(path: string, value: StartFileValue): StartEntry {
  if (typeof value === "string") {
    return { kind: "file", path, source: { kind: "content", content: value } };
  }
  const attributes: StartAttributes = {
    ...(value.owner === undefined ? {} : { owner: value.owner }),
    ...(value.group === undefined ? {} : { group: value.group }),
    ...(value.mode === undefined ? {} : { mode: value.mode }),
  };
  if (isDirectoryPath(path)) {
    return { kind: "directory", path: withoutTrailingSlash(path), ...attributes };
  }
  // checkStartFiles made sure that a file has content or text.
  const source: FileSource =
    value.text === undefined
      ? { kind: "content", content: value.content ?? "" }
      : { kind: "text", key: value.text };
  return { kind: "file", path, source, ...attributes };
}

function isDirectoryPath(path: string): boolean {
  return path.endsWith("/");
}

function withoutTrailingSlash(path: string): string {
  return isDirectoryPath(path) ? path.slice(0, -1) : path;
}

/** Turns a mode like `rwxr-s--T` into its number. */
export function parseMode(mode: string): number {
  const SPECIAL_BITS = [0o4000, 0o2000, 0o1000];
  let bits = 0;
  for (let triplet = 0; triplet < 3; triplet += 1) {
    const [read, write, execute] = mode.slice(triplet * 3, triplet * 3 + 3);
    const shift = (2 - triplet) * 3;
    const special = SPECIAL_BITS[triplet] ?? 0;
    if (read === "r") bits |= 0o4 << shift;
    if (write === "w") bits |= 0o2 << shift;
    if (execute === "x" || execute === "s" || execute === "t") bits |= 0o1 << shift;
    if (execute === "s" || execute === "S" || execute === "t" || execute === "T") bits |= special;
  }
  return bits;
}

/** Adds an issue at every repeated value of the list. */
export function reportDuplicates(
  values: readonly string[],
  what: string,
  context: z.RefinementCtx,
  path: (index: number) => PropertyKey[] = (index) => [index],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        path: path(index),
        message: `${what} "${value}" is repeated`,
      });
    }
    seen.add(value);
  });
}
