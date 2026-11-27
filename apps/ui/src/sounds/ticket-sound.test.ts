// Tests of the sound of a change in a ticket's progress (ADR 0113): the biggest moment wins, and
// a change that adds nothing is silent.
import { describe, expect, test } from "vitest";

import { TICKET_START, type TicketProgress } from "../tickets/ticket-progress";
import { ticketSound } from "./ticket-sound";

const SOLVED: TicketProgress = { ...TICKET_START, solved: true };

describe("ticketSound", () => {
  test("plays the fanfare when the ticket is solved", () => {
    expect(ticketSound(TICKET_START, SOLVED)).toBe("solved");
  });

  test("lets solving beat an extra goal and a message reached with it", () => {
    expect(
      ticketSound(TICKET_START, {
        ...SOLVED,
        completedSteps: 1,
        reachedExtraGoals: ["tidy"],
        messages: [{ kind: "extra-goal", id: "tidy", xp: 10 }],
      }),
    ).toBe("solved");
  });

  test("plays the goal sound for an extra goal, also after the ticket is solved", () => {
    expect(
      ticketSound(SOLVED, {
        ...SOLVED,
        reachedExtraGoals: ["tidy"],
        messages: [{ kind: "extra-goal", id: "tidy", xp: 10 }],
      }),
    ).toBe("goal");
  });

  test.each([
    ["a completed step", { ...TICKET_START, completedSteps: 1 }],
    ["a tip", { ...TICKET_START, messages: [{ kind: "tip", say: "tips.typo" }] }],
    ["a step's message", { ...TICKET_START, messages: [{ kind: "step", say: "steps.one" }] }],
    ["a hint", { ...TICKET_START, hintsShown: 1 }],
  ] as const)("plays the notification for %s", (_name, after) => {
    expect(ticketSound(TICKET_START, after)).toBe("notification");
  });

  test.each([
    ["no change", TICKET_START, TICKET_START],
    ["a ticket that stays solved", SOLVED, SOLVED],
    [
      "F1 after the last hint",
      { ...TICKET_START, hintsShown: 3 },
      { ...TICKET_START, hintsShown: 3 },
    ],
  ] as const)("is silent for %s", (_name, before, after) => {
    expect(ticketSound(before, after)).toBeUndefined();
  });
});
