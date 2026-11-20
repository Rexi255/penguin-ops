// The progress of the ticket being played as the ticket panel and the top bar show it (ROADMAP
// M3.5a, ADR 0097): how many steps are completed, whether the ticket is solved, and the messages
// the game said about it, in the order it said them. The game events of every input that ran
// update it; the functions are pure, so the tests need no DOM.

import type { GameEvent } from "@penguin-ops/gameplay";

/** A message of the game about the ticket; `say` is its text key in the level's catalog. */
export interface TicketMessage {
  /** A completed step's message, or a tip for a typical mistake. */
  readonly kind: "step" | "tip";
  readonly say: string;
}

/** What the player has reached in the ticket. */
export interface TicketProgress {
  /** How many steps are completed; always 0 for a ticket with a single goal. */
  readonly completedSteps: number;
  /** Whether the ticket is solved. It stays solved. */
  readonly solved: boolean;
  /** The messages of completed steps and the tips, oldest first. */
  readonly messages: readonly TicketMessage[];
}

/** The progress of a ticket that just started. */
export const TICKET_START: TicketProgress = { completedSteps: 0, solved: false, messages: [] };

/**
 * The progress after the game events of an input, in their order. Extra goals change nothing
 * here: the ticket panel lists them with ROADMAP M3.5c.
 */
export function applyGameEvents(
  progress: TicketProgress,
  events: readonly GameEvent[],
): TicketProgress {
  return events.reduce((current, event): TicketProgress => {
    switch (event.kind) {
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
        return current;
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
