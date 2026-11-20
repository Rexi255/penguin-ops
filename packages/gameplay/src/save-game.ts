// The save game format (ROADMAP M3.7a, ADR 0013, ADR 0104): what a save slot keeps of a game, how
// it is written as text and read back. Every save file names its format version; a file of an
// older version is converted step by step with the migrations in `SAVE_MIGRATIONS` before it is
// checked against the current schema, and a file of a newer version is refused.
//
// The module is pure: it neither reads nor writes files and never reads the real time. The
// desktop app's main process stores the text (M3.7b), and the UI passes the real time it shows
// as "last played" and "play time". Reading a save does not need the content: whether its levels,
// steps and extra goals still exist is for the game to decide when it resumes the game (M3.7c).

import { idSchema } from "@penguin-ops/content";
import { z } from "zod";

import {
  checkPlayerName,
  GAME_MODES,
  GAME_START_TIME,
  type NewGame,
  normalizePlayerName,
} from "./new-game";
import { checkUserName } from "./user-name";

/** The name every save file carries in its `format` field, to tell it from other JSON files. */
export const SAVE_FORMAT_NAME = "penguin-ops-save";

/** The save format version that this game writes and reads after migrating older files. */
export const SAVE_FORMAT_VERSION = 1;

/** Every level has exactly three hints: a tip, a concrete tip and the solution (ADR 0018). */
export const HINT_COUNT = 3;

/** What a game keeps of a ticket the player has opened. */
export interface TicketRecord {
  /** The level's ID. */
  readonly level: string;
  /** Whether the ticket is solved. A solved ticket stays solved. */
  readonly solved: boolean;
  /**
   * The ID of the last completed step of a multi-step ticket, where the ticket resumes
   * (`lastCompletedStep`, ADR 0013); `undefined` when no step is completed or the level has a
   * single goal.
   */
  readonly checkpoint?: string | undefined;
  /** How many of the ticket's hints the player has asked for, from 0 to `HINT_COUNT`. */
  readonly hintsShown: number;
  /** The IDs of the extra goals reached, in the order reached. */
  readonly reachedExtraGoals: readonly string[];
}

/** A game as a save slot keeps it. */
export interface SaveGame extends NewGame {
  /**
   * The game time in milliseconds since 1970 (UTC). It starts at `GAME_START_TIME` and runs on
   * across every ticket of the game (ADR 0104).
   */
  readonly gameTime: number;
  /** The real time the player has spent in this game, in milliseconds. */
  readonly playTime: number;
  /** When the game was last played, as a real time in milliseconds since 1970 (UTC). */
  readonly lastPlayed: number;
  /** The level of the ticket the player had open; it is one of `tickets`. */
  readonly currentTicket: string;
  /** Every ticket the player has opened, in the order opened; each level once. */
  readonly tickets: readonly TicketRecord[];
}

/**
 * Why a text is not a save game this version can read:
 *
 * - `not-json`: the text is not JSON;
 * - `not-a-save`: the JSON is no object with the `format` field `SAVE_FORMAT_NAME`;
 * - `too-new`: a newer version of the game wrote the file (`version`);
 * - `invalid`: the file breaks the format at `path` (a dotted path such as `tickets.0.level`,
 *   empty for the whole file); `message` says how, in English, for logs and bug reports. The
 *   UI shows only the code.
 */
export type SaveProblem =
  | { readonly code: "not-json" }
  | { readonly code: "not-a-save" }
  | { readonly code: "too-new"; readonly version: number }
  | { readonly code: "invalid"; readonly path: string; readonly message: string };

/** The result of `parseSave`. */
export type SaveParseResult =
  | {
      readonly kind: "save";
      readonly save: SaveGame;
      /**
       * The format version of the file. When it is older than `SAVE_FORMAT_VERSION`, the save was
       * migrated, and the file should be written again in the current version.
       */
      readonly fileVersion: number;
    }
  | { readonly kind: "problem"; readonly problem: SaveProblem };

/**
 * A step from one save format version to the next. `migrate` gets the parsed JSON object of a
 * file of version `from` and returns the object as version `from + 1` writes it; `migrateSave`
 * sets the new `version` field. Migrations never look at the content: a migration that needs
 * a level's data is a sign that the game should rather decide it when it resumes.
 */
export interface SaveMigration {
  readonly from: number;
  readonly migrate: (save: Readonly<Record<string, unknown>>) => Record<string, unknown>;
}

/**
 * The migrations of the save format, one for each version before `SAVE_FORMAT_VERSION`, in
 * order. Every change of the format adds one, with a stored example save of the old version in
 * `packages/gameplay/save-fixtures/` (ADR 0013).
 */
export const SAVE_MIGRATIONS: readonly SaveMigration[] = [];

/**
 * The save of a game that just started: the game time at `GAME_START_TIME`, no play time yet,
 * and `firstTicket` opened. `playedAt` is the real time of the start.
 */
export function newSaveGame(game: NewGame, firstTicket: string, playedAt: number): SaveGame {
  return {
    playerName: game.playerName,
    userName: game.userName,
    mode: game.mode,
    gameTime: GAME_START_TIME,
    playTime: 0,
    lastPlayed: playedAt,
    currentTicket: firstTicket,
    tickets: [{ level: firstTicket, solved: false, hintsShown: 0, reachedExtraGoals: [] }],
  };
}

/**
 * The text of the save file of `save`: JSON in the current format version with its fields in a
 * fixed order, indented by two spaces and ending with a line break, so that the same save always
 * gives the same text.
 */
export function serializeSave(save: SaveGame): string {
  const file = {
    format: SAVE_FORMAT_NAME,
    version: SAVE_FORMAT_VERSION,
    playerName: save.playerName,
    userName: save.userName,
    mode: save.mode,
    gameTime: save.gameTime,
    playTime: save.playTime,
    lastPlayed: save.lastPlayed,
    currentTicket: save.currentTicket,
    tickets: save.tickets.map((ticket) => ({
      level: ticket.level,
      solved: ticket.solved,
      checkpoint: ticket.checkpoint,
      hintsShown: ticket.hintsShown,
      reachedExtraGoals: [...ticket.reachedExtraGoals],
    })),
  } satisfies SaveFile;
  return `${JSON.stringify(file, undefined, 2)}\n`;
}

/**
 * Reads the text of a save file: checks that it is a save, migrates an older version to the
 * current one and checks it against the current format. Never throws for a broken file; the
 * result names the first problem.
 */
export function parseSave(text: string): SaveParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return problem({ code: "not-json" });
  }
  if (!isRecord(data) || data["format"] !== SAVE_FORMAT_NAME) {
    return problem({ code: "not-a-save" });
  }
  const version = data["version"];
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
    return problem({
      code: "invalid",
      path: "version",
      message: "the version must be a whole number from 1",
    });
  }
  if (version > SAVE_FORMAT_VERSION) {
    return problem({ code: "too-new", version });
  }
  const checked = saveFileSchema.safeParse(
    migrateSave(data, version, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS),
  );
  if (!checked.success) {
    const [issue] = checked.error.issues;
    return problem({
      code: "invalid",
      path: issue === undefined ? "" : issue.path.map(String).join("."),
      message: issue === undefined ? "the save is invalid" : issue.message,
    });
  }
  return { kind: "save", save: toSaveGame(checked.data), fileVersion: version };
}

/**
 * Converts the parsed save file `data` of format version `version` to version `target` with
 * `migrations`, one version at a time, and sets its `version` field. Throws if a migration on
 * the way is missing: that is a mistake in the game, not in the file.
 */
export function migrateSave(
  data: Readonly<Record<string, unknown>>,
  version: number,
  target: number,
  migrations: readonly SaveMigration[],
): Readonly<Record<string, unknown>> {
  let current = data;
  for (let from = version; from < target; from += 1) {
    const migration = migrations.find((candidate) => candidate.from === from);
    if (migration === undefined) {
      throw new Error(`There is no save migration from version ${String(from)}.`);
    }
    current = { ...migration.migrate(current), version: from + 1 };
  }
  return current;
}

function problem(saveProblem: SaveProblem): SaveParseResult {
  return { kind: "problem", problem: saveProblem };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A whole number of milliseconds that a JavaScript number holds exactly. */
const millisecondsSchema = z.int({ error: "a time must be a whole number of milliseconds" });

const ticketRecordSchema = z
  .strictObject({
    level: idSchema("a level ID"),
    solved: z.boolean(),
    checkpoint: idSchema("a step ID").optional(),
    hintsShown: z
      .int({ error: "the number of hints shown must be a whole number" })
      .min(0, { error: "the number of hints shown cannot be negative" })
      .max(HINT_COUNT, { error: `a ticket has only ${String(HINT_COUNT)} hints` }),
    reachedExtraGoals: z.array(idSchema("an extra goal ID")),
  })
  .superRefine((ticket, context) => {
    reportDuplicates(ticket.reachedExtraGoals, "the extra goal", context, (index) => [
      "reachedExtraGoals",
      index,
    ]);
  });

/** Schema of a save file of the current format version. */
const saveFileSchema = z
  .strictObject({
    format: z.literal(SAVE_FORMAT_NAME),
    version: z.literal(SAVE_FORMAT_VERSION),
    playerName: z.string().superRefine((name, context) => {
      const nameProblem = checkPlayerName(name);
      if (nameProblem !== undefined) {
        context.addIssue({ code: "custom", message: `the player name is ${nameProblem}` });
      } else if (normalizePlayerName(name) !== name) {
        context.addIssue({ code: "custom", message: "the player name is not normalized" });
      }
    }),
    userName: z.string().superRefine((name, context) => {
      const nameProblem = checkUserName(name);
      if (nameProblem !== undefined) {
        context.addIssue({
          code: "custom",
          message: `the user name has the problem ${nameProblem}`,
        });
      }
    }),
    mode: z.enum(GAME_MODES),
    gameTime: millisecondsSchema.min(GAME_START_TIME, {
      error: "the game time cannot be before the game's start time",
    }),
    playTime: millisecondsSchema.min(0, { error: "the play time cannot be negative" }),
    lastPlayed: millisecondsSchema,
    currentTicket: idSchema("a level ID"),
    tickets: z.array(ticketRecordSchema).superRefine((tickets, context) => {
      reportDuplicates(
        tickets.map((ticket) => ticket.level),
        "the ticket",
        context,
        (index) => [index, "level"],
      );
    }),
  })
  .superRefine((save, context) => {
    if (!save.tickets.some((ticket) => ticket.level === save.currentTicket)) {
      context.addIssue({
        code: "custom",
        path: ["currentTicket"],
        message: `the current ticket "${save.currentTicket}" is not among the opened tickets`,
      });
    }
  });

/** A save file of the current format version as JSON holds it. */
type SaveFile = z.infer<typeof saveFileSchema>;

/** Adds an issue at `path(index)` for every value of `values` that came before. */
function reportDuplicates(
  values: readonly string[],
  what: string,
  context: z.RefinementCtx,
  path: (index: number) => PropertyKey[],
): void {
  values.forEach((value, index) => {
    if (values.indexOf(value) !== index) {
      context.addIssue({
        code: "custom",
        path: path(index),
        message: `${what} "${value}" is listed twice`,
      });
    }
  });
}

function toSaveGame(file: SaveFile): SaveGame {
  return {
    playerName: file.playerName,
    userName: file.userName,
    mode: file.mode,
    gameTime: file.gameTime,
    playTime: file.playTime,
    lastPlayed: file.lastPlayed,
    currentTicket: file.currentTicket,
    tickets: file.tickets.map((ticket) => ({
      level: ticket.level,
      solved: ticket.solved,
      ...(ticket.checkpoint === undefined ? {} : { checkpoint: ticket.checkpoint }),
      hintsShown: ticket.hintsShown,
      reachedExtraGoals: ticket.reachedExtraGoals,
    })),
  };
}
