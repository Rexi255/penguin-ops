// Resuming a saved game (ROADMAP M3.7c, ADR 0013, ADR 0104, ADR 0106). A save file does not know
// the content; when the game resumes, `fitSaveToContent` makes the save match the content the
// game ships now, which an update may have changed, and `resumeTicket` starts a ticket of the
// save where the player left it: at its checkpoint, with its solved state and its reached extra
// goals. Both functions are pure.

import type { Content } from "@penguin-ops/content";
import type { GameClock } from "@penguin-ops/engine";

import { isTicketOpen, openChapters } from "./inbox";
import { type LevelSession, type LevelSetup, startLevel } from "./level-session";
import type { SaveGame, TicketRecord } from "./save-game";

/** What a save keeps of a ticket the player opens now for the first time. */
export function newTicketRecord(level: string): TicketRecord {
  return { level, solved: false, hintsShown: 0, reachedExtraGoals: [] };
}

/**
 * The save `save` fitted to `content` (ADR 0106). An update of the game may remove a level, a
 * step or an extra goal, or move a level to a later chapter; the save then keeps what still
 * exists:
 *
 * - a ticket whose level no longer exists in a chapter is dropped;
 * - a checkpoint that is no longer a step of its level is dropped, so the ticket starts again;
 *   a solved ticket with steps gets its last step as the checkpoint, so it resumes in the world
 *   of its solution;
 * - a reached extra goal that its level no longer has is dropped;
 * - a current ticket that was dropped or is not open becomes the first unsolved ticket of the
 *   open chapters in game order, or the first open ticket when every one is solved; it is
 *   added to the tickets if the player never opened it.
 *
 * A save that fits already comes back equal, with the same tickets in the same order.
 */
export function fitSaveToContent(
  content: Pick<Content, "chapters" | "levels">,
  save: SaveGame,
): SaveGame {
  const inChapter = new Set(content.chapters.flatMap((chapter) => chapter.levels));
  const tickets = save.tickets.flatMap((ticket): TicketRecord[] => {
    const level = content.levels.get(ticket.level);
    if (level === undefined || !inChapter.has(ticket.level)) {
      return [];
    }
    const stepIds = (level.steps ?? []).map((step) => step.id);
    const lastStep = stepIds.at(-1);
    const checkpoint =
      ticket.solved && lastStep !== undefined
        ? lastStep
        : ticket.checkpoint !== undefined && stepIds.includes(ticket.checkpoint)
          ? ticket.checkpoint
          : undefined;
    const goalIds = new Set(level.extraGoals.map((goal) => goal.id));
    return [
      {
        level: ticket.level,
        solved: ticket.solved,
        ...(checkpoint === undefined ? {} : { checkpoint }),
        hintsShown: ticket.hintsShown,
        reachedExtraGoals: ticket.reachedExtraGoals.filter((id) => goalIds.has(id)),
      },
    ];
  });
  const solved = new Set(tickets.filter((ticket) => ticket.solved).map((ticket) => ticket.level));
  const opened = new Set(tickets.map((ticket) => ticket.level));
  const currentTicket =
    opened.has(save.currentTicket) &&
    isTicketOpen(content.chapters, save.mode, solved, save.currentTicket)
      ? save.currentTicket
      : fallbackTicket(content, save, solved);
  return {
    ...save,
    currentTicket,
    tickets: opened.has(currentTicket) ? tickets : [...tickets, newTicketRecord(currentTicket)],
  };
}

/** The first unsolved ticket of the open chapters, or the first open ticket. */
function fallbackTicket(
  content: Pick<Content, "chapters">,
  save: SaveGame,
  solved: ReadonlySet<string>,
): string {
  const open = openChapters(content.chapters, save.mode, solved).flatMap(
    (chapter) => chapter.levels,
  );
  const ticket = open.find((levelId) => !solved.has(levelId)) ?? open[0];
  if (ticket === undefined) {
    // The content loader makes sure that the first chapter has a level.
    throw new Error("the content has no chapter with a level");
  }
  return ticket;
}

/**
 * Starts the ticket of `record` where the player left it (ADR 0013): at its checkpoint, so that
 * the completed steps stay completed, with the extra goals the player had reached, and solved if
 * it was solved. The terminal starts empty, and tips may be shown again. `record` must fit the
 * level (`fitSaveToContent`).
 *
 * Throws what `startLevel` throws.
 */
export function resumeTicket(
  setup: LevelSetup,
  clock: GameClock,
  record: TicketRecord,
): LevelSession {
  const session = startLevel(setup, clock, record.checkpoint);
  return {
    ...session,
    ...(record.solved ? { solved: true, completedSteps: setup.level.steps?.length ?? 0 } : {}),
    reachedExtraGoals: [...record.reachedExtraGoals],
  };
}
