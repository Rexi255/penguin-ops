// Tests of the ticket's progress (ADR 0097, ADR 0098, ADR 0100): what the game events of an input
// add up to, the step the player works on, the hints the player asked for and the reached extra
// goals.
import type { GameEvent } from "@penguin-ops/gameplay";
import { describe, expect, test } from "vitest";

import {
  applyGameEvents,
  HINT_COUNT,
  showNextHint,
  stepPosition,
  TICKET_START,
  type TicketProgress,
} from "./ticket-progress";

describe("applyGameEvents", () => {
  test("starts with no step, unsolved, without messages, extra goals and hints", () => {
    expect(TICKET_START).toEqual({
      completedSteps: 0,
      solved: false,
      messages: [],
      reachedExtraGoals: [],
      hintsShown: 0,
    });
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
      reachedExtraGoals: [],
      hintsShown: 0,
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

  test("keeps a reached extra goal and adds a message with its bonus XP", () => {
    const events: GameEvent[] = [{ kind: "extra-goal", id: "floor1", xp: 20 }];
    expect(applyGameEvents(TICKET_START, events)).toEqual({
      ...TICKET_START,
      reachedExtraGoals: ["floor1"],
      messages: [{ kind: "extra-goal", id: "floor1", xp: 20 }],
    });
  });

  test("keeps extra goals in the order reached, also after solving", () => {
    const first = applyGameEvents(TICKET_START, [
      { kind: "step-completed", step: "backup", say: "step-backup" },
      { kind: "extra-goal", id: "floor1", xp: 20 },
    ]);
    const second = applyGameEvents(first, [
      { kind: "solved" },
      { kind: "extra-goal", id: "careful", xp: 50 },
    ]);
    expect(second.solved).toBe(true);
    expect(second.reachedExtraGoals).toEqual(["floor1", "careful"]);
    expect(second.messages).toEqual([
      { kind: "step", say: "step-backup" },
      { kind: "extra-goal", id: "floor1", xp: 20 },
      { kind: "extra-goal", id: "careful", xp: 50 },
    ]);
    // The earlier progress is unchanged.
    expect(first.reachedExtraGoals).toEqual(["floor1"]);
  });

  test("keeps the hints shown", () => {
    const hinted = showNextHint(TICKET_START);
    expect(applyGameEvents(hinted, [{ kind: "solved" }]).hintsShown).toBe(1);
  });
});

describe("showNextHint", () => {
  test("shows one more hint each time, up to the three hints of every level", () => {
    expect(HINT_COUNT).toBe(3);
    const first = showNextHint(TICKET_START);
    const second = showNextHint(first);
    const third = showNextHint(second);
    expect([first, second, third].map((progress) => progress.hintsShown)).toEqual([1, 2, 3]);
    // The earlier progress is unchanged.
    expect(TICKET_START.hintsShown).toBe(0);
  });

  test("keeps the progress the same once all hints are shown", () => {
    const all: TicketProgress = { ...TICKET_START, hintsShown: HINT_COUNT };
    expect(showNextHint(all)).toBe(all);
  });

  test("still shows hints after the ticket is solved", () => {
    const solved = applyGameEvents(TICKET_START, [{ kind: "solved" }]);
    expect(showNextHint(solved)).toEqual({ ...solved, hintsShown: 1 });
  });

  test("changes nothing but the hints", () => {
    const progress: TicketProgress = {
      completedSteps: 1,
      solved: false,
      messages: [{ kind: "tip", say: "tip-moved-config" }],
      reachedExtraGoals: ["floor1"],
      hintsShown: 1,
    };
    expect(showNextHint(progress)).toEqual({ ...progress, hintsShown: 2 });
  });
});

describe("stepPosition", () => {
  const progress = (completedSteps: number, solved = false): TicketProgress => ({
    completedSteps,
    solved,
    messages: [],
    reachedExtraGoals: [],
    hintsShown: 0,
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
