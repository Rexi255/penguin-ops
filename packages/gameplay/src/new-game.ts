// What the player chooses on "New game" (ADR 0017, ADR 0019, ADR 0094): their name, the Linux
// user name derived from it (`user-name.ts`) and the game mode of the save slot. The checks
// return problem codes, never texts: the UI translates them. A new game starts with the first
// level at the game's start time (ADR 0095).

import type { Content } from "@penguin-ops/content";

/**
 * The game modes, fixed per save slot when it is created (ADR 0017): `story` unlocks the
 * chapters one after another with story scenes, mails and promotions (shown as "Career");
 * `sandbox` opens every chapter and ticket from the start, without story scenes.
 */
export const GAME_MODES = ["story", "sandbox"] as const;

/** A game mode of `GAME_MODES`. */
export type GameMode = (typeof GAME_MODES)[number];

/** The longest player name in characters (Unicode code points), so it fits on a save slot. */
export const PLAYER_NAME_MAX_LENGTH = 40;

/**
 * Why a player name is not allowed:
 *
 * - `empty`: there is no name, or only white space;
 * - `too-long`: longer than `PLAYER_NAME_MAX_LENGTH` characters.
 */
export type PlayerNameProblem = "empty" | "too-long";

/**
 * The game time when a new game starts: Monday, 2026-01-05, 08:00 UTC, the player's first
 * morning in the office. The simulated hosts run on UTC (ADR 0055).
 */
export const GAME_START_TIME = 1_767_600_000_000;

/**
 * The ID of the level a new game starts with: the first level of the first chapter. The content
 * loader makes sure that there is one.
 */
export function startingLevelId(content: Pick<Content, "chapters">): string {
  const id = content.chapters[0]?.levels[0];
  if (id === undefined) {
    throw new Error("the content has no chapter with a level");
  }
  return id;
}

/** A new game, ready for a save slot. */
export interface NewGame {
  /** The player's name as `normalizePlayerName` returns it. */
  readonly playerName: string;
  /** The Linux user name, which `checkUserName` accepted. */
  readonly userName: string;
  readonly mode: GameMode;
}

/**
 * The player's name as it is kept: in Unicode normal form NFC, without white space at the start
 * and the end, and with every run of white space inside as one space ("  Anna   Lena " →
 * "Anna Lena").
 */
export function normalizePlayerName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/** The first problem of the player name `name` after `normalizePlayerName`, or undefined. */
export function checkPlayerName(name: string): PlayerNameProblem | undefined {
  const normalized = normalizePlayerName(name);
  if (normalized === "") {
    return "empty";
  }
  if (Array.from(normalized).length > PLAYER_NAME_MAX_LENGTH) {
    return "too-long";
  }
  return undefined;
}
