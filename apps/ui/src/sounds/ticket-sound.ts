// The sound of a change in the ticket being played (ROADMAP M3.10, ADR 0113): the game screen
// compares the ticket's progress before and after every change and plays the sound of the biggest
// moment in it. Solving the ticket beats a reached extra goal, which beats anything new in the
// ticket panel: a completed step, a message, or a hint. A change that adds nothing, such as F1
// after the last hint, is silent.

import type { TicketProgress } from "../tickets/ticket-progress";
import type { UiSound } from "./ui-sounds";

/** The sound of the change of a ticket's progress from `before` to `after`, if any. */
export function ticketSound(before: TicketProgress, after: TicketProgress): UiSound | undefined {
  if (after.solved && !before.solved) {
    return "solved";
  }
  if (after.reachedExtraGoals.length > before.reachedExtraGoals.length) {
    return "goal";
  }
  if (
    after.completedSteps > before.completedSteps ||
    after.messages.length > before.messages.length ||
    after.hintsShown > before.hintsShown
  ) {
    return "notification";
  }
  return undefined;
}
