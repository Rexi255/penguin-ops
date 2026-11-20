// Save files for the end-to-end tests of saving, export and import (ADR 0106, ADR 0107): an
// example save and functions that store and read the slot files in the test's user data folder.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { expect } from "./app";

/** The game start time of ADR 0095: 2026-01-05, 08:00 UTC. */
export const GAME_START_TIME = 1_767_600_000_000;

/** A save of Ada in Sandbox mode, in the middle of the multi-step ticket "project-folders". */
export const ADA_SAVE = `${JSON.stringify(
  {
    format: "penguin-ops-save",
    version: 1,
    playerName: "Ada Lovelace",
    userName: "ada",
    mode: "sandbox",
    gameTime: GAME_START_TIME + 3_600_000,
    playTime: 4_500_000,
    lastPlayed: 1_795_168_800_000,
    currentTicket: "project-folders",
    tickets: [
      { level: "first-steps", solved: true, hintsShown: 0, reachedExtraGoals: [] },
      {
        level: "project-folders",
        solved: false,
        checkpoint: "folders",
        hintsShown: 1,
        reachedExtraGoals: [],
      },
    ],
  },
  undefined,
  2,
)}\n`;

/** Reads the save file of the slot `number` (counting from 1) in the user data folder. */
export async function readSave(
  userDataDir: string,
  number: number,
): Promise<Record<string, unknown>> {
  const text = await readFile(join(userDataDir, "saves", `slot-${String(number)}.json`), "utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Writes `text` as the save of the slot `number` and reloads the page, which reads the slots
 * again; `play` is the name of the start screen's Play in the app's language.
 */
export async function storeSave(
  page: Page,
  userDataDir: string,
  number: number,
  text: string,
  play = "Play",
) {
  const folder = join(userDataDir, "saves");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, `slot-${String(number)}.json`), text);
  await page.reload();
  await expect(page.getByRole("button", { name: play })).toBeFocused();
}

/**
 * Reads the save file of the slot `number` like `readSave`, or `undefined` while it cannot be read
 * yet: before the first save, or while Windows holds the file during the rename of a save. For
 * `expect.poll`, which retries a failed check but not a callback that throws.
 */
export async function savedSoFar(
  userDataDir: string,
  number: number,
): Promise<Record<string, unknown> | undefined> {
  try {
    return await readSave(userDataDir, number);
  } catch {
    return undefined;
  }
}
