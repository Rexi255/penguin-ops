// The chapter inbox (ROADMAP M3.5c, ADR 0017, ADR 0099): which chapters and tickets a game
// offers, the state of each ticket, and the ticket that follows a solved one. Every function is
// pure and works on the chapters of the content and the levels the player has started and
// solved, so the save system (M3.7) only has to keep these two sets.
//
// In Story mode the chapters open one after another: the first chapter is open from the start,
// and each further chapter opens when every ticket of the chapters before it is solved. Inside an
// open chapter the tickets can be played in any order. In Sandbox mode every chapter is open from
// the start.

import type { Chapter } from "@penguin-ops/content";

import type { GameMode } from "./new-game";

/**
 * The state of a ticket in the inbox:
 *
 * - `new`: the player has not opened it yet;
 * - `started`: the player has opened it and not solved it yet;
 * - `solved`: the player has solved it. A solved ticket stays solved.
 */
export type TicketState = "new" | "started" | "solved";

/** What the player has done in a game: the IDs of the levels started and solved. */
export interface CampaignProgress {
  /** The levels the player has opened; a solved level may or may not be in it. */
  readonly started: ReadonlySet<string>;
  /** The levels the player has solved. */
  readonly solved: ReadonlySet<string>;
}

/** A ticket in the inbox: its level and its state. */
export interface InboxTicket {
  readonly levelId: string;
  readonly state: TicketState;
}

/** An open chapter in the inbox with its tickets in game order. */
export interface InboxChapter {
  readonly id: string;
  readonly tickets: readonly InboxTicket[];
}

/** The state of the level `levelId` in `progress`. */
export function ticketState(progress: CampaignProgress, levelId: string): TicketState {
  if (progress.solved.has(levelId)) {
    return "solved";
  }
  return progress.started.has(levelId) ? "started" : "new";
}

/**
 * The chapters that are open in a game of `mode`, in game order: every chapter in Sandbox mode;
 * in Story mode the first chapter and each one whose earlier chapters have every ticket solved.
 */
export function openChapters(
  chapters: readonly Chapter[],
  mode: GameMode,
  solved: ReadonlySet<string>,
): readonly Chapter[] {
  switch (mode) {
    case "sandbox":
      return chapters;
    case "story": {
      const open: Chapter[] = [];
      for (const chapter of chapters) {
        open.push(chapter);
        if (!chapter.levels.every((levelId) => solved.has(levelId))) {
          break;
        }
      }
      return open;
    }
  }
}

/** The inbox of a game of `mode`: its open chapters with the state of every ticket. */
export function inbox(
  chapters: readonly Chapter[],
  mode: GameMode,
  progress: CampaignProgress,
): readonly InboxChapter[] {
  return openChapters(chapters, mode, progress.solved).map((chapter) => ({
    id: chapter.id,
    tickets: chapter.levels.map((levelId) => ({
      levelId,
      state: ticketState(progress, levelId),
    })),
  }));
}

/** Whether the level `levelId` is in an open chapter of a game of `mode`. */
export function isTicketOpen(
  chapters: readonly Chapter[],
  mode: GameMode,
  solved: ReadonlySet<string>,
  levelId: string,
): boolean {
  return openChapters(chapters, mode, solved).some((chapter) => chapter.levels.includes(levelId));
}

/** The chapter that holds the level `levelId`. Throws if no chapter holds it. */
export function chapterOf(chapters: readonly Chapter[], levelId: string): Chapter {
  const chapter = chapters.find((candidate) => candidate.levels.includes(levelId));
  if (chapter === undefined) {
    throw new Error(`No chapter holds the level "${levelId}".`);
  }
  return chapter;
}

/**
 * The ticket the game offers after the level `levelId`: the first unsolved ticket of an open
 * chapter after it in game order, or else the first unsolved one before it. `undefined` when
 * every ticket of every open chapter is solved, which in Story mode means every ticket of the
 * game. The level `levelId` itself is never the next ticket.
 */
export function nextTicket(
  chapters: readonly Chapter[],
  mode: GameMode,
  solved: ReadonlySet<string>,
  levelId: string,
): string | undefined {
  const open = openChapters(chapters, mode, solved).flatMap((chapter) => chapter.levels);
  const index = open.indexOf(levelId);
  const ordered = [...open.slice(index + 1), ...open.slice(0, Math.max(index, 0))];
  return ordered.find((candidate) => candidate !== levelId && !solved.has(candidate));
}
