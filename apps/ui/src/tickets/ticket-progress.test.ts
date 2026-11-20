// Tests of the ticket's progress (ADR 0097): what the game events of an input add up to, and the
// step the player works on.
import type { GameEvent } from "@penguin-ops/gameplay";
import { describe, expect, test } from "vitest";

import {
  applyGameEvents,
  stepPosition,
  TICKET_START,
  type TicketProgress,
} from "./ticket-progress";

describe("applyGameEvents", () => {
  test("starts with no step, unsolved and without messages", () => {
    expect(TICKET_START).toEqual({ completedSteps: 0, solved: false, messages: [] });
  });

  test("changes nothing without events", () => {
    expect(applyGameEvents(TICKET_START, [])).toBe(TICKET_START);
  });

  test("counts completed steps and keeps their messages in order", () => {
    const progress = applyGameEvents(TICKET_START, [
      { kind: "step-completed", step: "backup", say: "step-backup" },
      { kind: "step-completed", step: "firmware" },
    ]);
    expect(progress).toEqual({
      completedSteps: 2,
      solved: false,
      messages: [{ kind: "step", say: "step-backup" }],
    });
  });

  test("marks the ticket solved and keeps it solved", () => {
    const solved = applyGameEvents(TICKET_START, [{ kind: "solved" }]);
    expect(solved.solved).toBe(true);
    expect(applyGameEvents(solved, [{ kind: "tip", say: "tip-late" }]).solved).toBe(true);
  });

  test("adds tips after the messages before them, across inputs", () => {
    const first = applyGameEvents(TICKET_START, [{ kind: "tip", say: "tip-moved-config" }]);
    const second = applyGameEvents(first, [
      { kind: "step-completed", step: "backup", say: "step-backup" },
      { kind: "tip", say: "tip-copied-firmware" },
    ]);
    expect(second.messages).toEqual([
      { kind: "tip", say: "tip-moved-config" },
      { kind: "step", say: "step-backup" },
      { kind: "tip", say: "tip-copied-firmware" },
    ]);
    // The earlier progress is unchanged.
    expect(first.messages).toEqual([{ kind: "tip", say: "tip-moved-config" }]);
  });

  test("leaves the progress unchanged for an extra goal", () => {
    const events: GameEvent[] = [{ kind: "extra-goal", id: "floor1", xp: 20 }];
    expect(applyGameEvents(TICKET_START, events)).toEqual(TICKET_START);
  });
});

describe("stepPosition", () => {
  const progress = (completedSteps: number, solved = false): TicketProgress => ({
    completedSteps,
    solved,
    messages: [],
  });

  test("has no step for a ticket with a single goal", () => {
    expect(stepPosition(progress(0), 0)).toBeUndefined();
    expect(stepPosition(progress(0, true), 0)).toBeUndefined();
  });

  test("names the step after the completed ones, counting from 1", () => {
    expect(stepPosition(progress(0), 3)).toEqual({ current: 1, count: 3 });
    expect(stepPosition(progress(2), 3)).toEqual({ current: 3, count: 3 });
  });

  test("has no step for a solved ticket", () => {
    expect(stepPosition(progress(3, true), 3)).toBeUndefined();
  });

  test("never names a step after the last one", () => {
    expect(stepPosition(progress(5), 3)).toEqual({ current: 3, count: 3 });
  });
});
