// The progress of the ticket being played as the ticket panel and the top bar show it (ROADMAP
// M3.5a, ADR 0097): how many steps are completed, whether the ticket is solved, and the messages
// the game said about it, in the order it said them. The game events of every input that ran
// update it. It also counts the hints the player has asked for with F1 or the game command `hint`
// (M3.5b, M3.6b, ADR 0098, ADR 0103) and keeps the extra goals the player has reached (M3.5d,
// ADR 0100). The functions are pure, so the tests need no DOM.

import type { GameEvent } from "@penguin-ops/gameplay";

/** A message of the game about the ticket. */
export type TicketMessage =
  | {
      /** A completed step's message, or a tip for a typical mistake. */
      readonly kind: "step" | "tip";
      /** The message's text key in the level's catalog. */
      readonly say: string;
    }
  | {
      /** An extra goal was reached. */
      readonly kind: "extra-goal";
      /** The extra goal's ID; its description is `extra_goals.<id>` in the level's catalog. */
      readonly id: string;
      /** The bonus XP of the extra goal. */
      readonly xp: number;
    };

/** What the player has reached in the ticket. */
export interface TicketProgress {
  /** How many steps are completed; always 0 for a ticket with a single goal. */
  readonly completedSteps: number;
  /** Whether the ticket is solved. It stays solved. */
  readonly solved: boolean;
  /** The messages of completed steps, tips and reached extra goals, oldest first. */
  readonly messages: readonly TicketMessage[];
  /** The IDs of the extra goals reached so far, in the order reached. */
  readonly reachedExtraGoals: readonly string[];
  /** How many of the ticket's hints the player has asked for, from 0 to `HINT_COUNT`. */
  readonly hintsShown: number;
}

/** Every level has exactly three hints: a tip, a concrete tip and the solution (ADR 0018). */
export const HINT_COUNT = 3;

/** The progress of a ticket that just started. */
export const TICKET_START: TicketProgress = {
  completedSteps: 0,
  solved: false,
  messages: [],
  reachedExtraGoals: [],
  hintsShown: 0,
};

/**
 * The progress after the player asked for the next hint. Hints are free and stay available after
 * the ticket is solved (ADR 0018); once all of them are shown, the progress stays the same.
 */
export function showNextHint(progress: TicketProgress): TicketProgress {
  if (progress.hintsShown >= HINT_COUNT) {
    return progress;
  }
  return { ...progress, hintsShown: progress.hintsShown + 1 };
}

/**
 * The progress after the game events of an input, in their order. The game command `hint` asks
 * for the next hint like F1 (ADR 0103). A reached extra goal is kept
 * and gets a message, also after the ticket is solved; the level session reaches each extra goal
 * only once.
 */
export function applyGameEvents(
  progress: TicketProgress,
  events: readonly GameEvent[],
): TicketProgress {
  return events.reduce((current, event): TicketProgress => {
    switch (event.kind) {
      case "hint-requested":
        return showNextHint(current);
      case "step-completed":
        return {
          ...current,
          completedSteps: current.completedSteps + 1,
          messages:
            event.say === undefined
              ? current.messages
              : [...current.messages, { kind: "step", say: event.say }],
        };
      case "solved":
        return { ...current, solved: true };
      case "tip":
        return { ...current, messages: [...current.messages, { kind: "tip", say: event.say }] };
      case "extra-goal":
        return {
          ...current,
          reachedExtraGoals: [...current.reachedExtraGoals, event.id],
          messages: [...current.messages, { kind: "extra-goal", id: event.id, xp: event.xp }],
        };
    }
  }, progress);
}

/** Where the player is in a ticket with steps: the step to play, counting from 1. */
export interface StepPosition {
  readonly current: number;
  readonly count: number;
}

/**
 * The step the player works on in a ticket with `stepCount` steps, or `undefined` for a ticket
 * with a single goal (`stepCount` 0) and for a solved ticket.
 */
export function stepPosition(
  progress: TicketProgress,
  stepCount: number,
): StepPosition | undefined {
  if (stepCount === 0 || progress.solved) {
    return undefined;
  }
  return { current: Math.min(progress.completedSteps + 1, stepCount), count: stepCount };
}
