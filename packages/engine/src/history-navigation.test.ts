import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import { recordHistory } from "./history";
import {
  acceptHistoryLine,
  AT_NEW_LINE,
  type HistoryNavigation,
  type HistoryStep,
  nextHistory,
  previousHistory,
} from "./history-navigation";
import { createSession, type Session } from "./session";
import { buildWorld } from "./world-builder";

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [{ name: "alice", gid: 1000 }],
        users: [{ name: "alice", uid: 1000 }],
      },
    ],
  },
  createGameClock(0),
);

const alice = createSession(world, "ws01", "alice");
/** Alice after running `echo a` and `echo b`. */
const withTwo = ["echo a", "echo b"].reduce(recordHistory, alice);

/** A key and, for keys that edit, the line after the edit. */
type Key = "up" | "down" | { readonly edit: string };

/** Presses `keys` in order on a new input line `line`; returns every step after an arrow key. */
function press(session: Session, line: string, keys: readonly Key[]): readonly HistoryStep[] {
  const steps: HistoryStep[] = [];
  let state: HistoryStep = {
    session,
    navigation: AT_NEW_LINE,
    line,
    cursor: line.length,
    bell: false,
  };
  for (const key of keys) {
    if (key === "up" || key === "down") {
      const move = key === "up" ? previousHistory : nextHistory;
      state = move(state.session, state.navigation, state.line);
      steps.push(state);
    } else {
      state = { ...state, line: key.edit, cursor: key.edit.length };
    }
  }
  return steps;
}

/** The lines of the steps, as the input line shows them. */
function lines(steps: readonly HistoryStep[]): readonly string[] {
  return steps.map((step) => step.line);
}

function last(steps: readonly HistoryStep[]): HistoryStep {
  const step = steps.at(-1);
  if (step === undefined) {
    throw new Error("no step");
  }
  return step;
}

describe("previousHistory and nextHistory", () => {
  test("Up shows older entries, Down newer ones and then the saved new line", () => {
    const steps = press(withTwo, "typing", ["up", "up", "down", "down"]);
    expect(lines(steps)).toEqual(["echo b", "echo a", "echo b", "typing"]);
    expect(steps.map((step) => step.navigation)).toEqual([
      { index: 1, savedLine: "typing" },
      { index: 0, savedLine: "typing" },
      { index: 1, savedLine: "typing" },
      AT_NEW_LINE,
    ]);
    expect(steps.map((step) => step.bell)).toEqual([false, false, false, false]);
  });

  test("the cursor goes to the end of the line", () => {
    const steps = press(withTwo, "typing", ["up", "up", "down", "down"]);
    expect(steps.map((step) => step.cursor)).toEqual([6, 6, 6, 6]);
  });

  test("Up at the oldest entry rings the bell and keeps the line", () => {
    const step = last(press(withTwo, "", ["up", "up", "up"]));
    expect(step).toMatchObject({ line: "echo a", cursor: 6, bell: true });
    expect(step.navigation).toEqual({ index: 0, savedLine: "" });
  });

  test("Up with an empty history rings the bell", () => {
    expect(previousHistory(alice, AT_NEW_LINE, "abc")).toEqual({
      session: alice,
      navigation: AT_NEW_LINE,
      line: "abc",
      cursor: 3,
      bell: true,
    });
  });

  test("Down on the new line changes nothing and rings no bell", () => {
    expect(nextHistory(withTwo, AT_NEW_LINE, "abc")).toEqual({
      session: withTwo,
      navigation: AT_NEW_LINE,
      line: "abc",
      cursor: 3,
      bell: false,
    });
  });

  test("moving without edits keeps the history", () => {
    const step = last(press(withTwo, "", ["up", "up", "down"]));
    expect(step.session.history).toEqual(withTwo.history);
  });

  test("an edited entry keeps the edit and its original when the player moves on", () => {
    const steps = press(withTwo, "typing", ["up", { edit: "echo bX" }, "up", "down", "down"]);
    expect(lines(steps)).toEqual(["echo b", "echo a", "echo bX", "typing"]);
    expect(last(steps).session.history.entries).toEqual([
      { line: "echo a" },
      { line: "echo bX", original: "echo b" },
    ]);
  });

  test("an edit of the oldest entry is saved also when Up rings the bell", () => {
    const step = last(press(withTwo, "", ["up", "up", { edit: "echo aY" }, "up"]));
    expect(step.bell).toBe(true);
    expect(step.line).toBe("echo aY");
    expect(step.session.history.entries[0]).toEqual({ line: "echo aY", original: "echo a" });
  });

  test("an entry edited twice keeps its first original, also when edited back", () => {
    const keys: Key[] = ["up", { edit: "echo bX" }, "up", "down", { edit: "echo b" }, "up"];
    const step = last(press(withTwo, "", keys));
    expect(step.session.history.entries[1]).toEqual({ line: "echo b", original: "echo b" });
  });

  test("an index outside the history is a RangeError", () => {
    for (const index of [-1, 2, 0.5]) {
      const navigation: HistoryNavigation = { index, savedLine: "" };
      expect(() => previousHistory(withTwo, navigation, "")).toThrow(RangeError);
      expect(() => nextHistory(withTwo, navigation, "")).toThrow(RangeError);
      expect(() => acceptHistoryLine(withTwo, navigation)).toThrow(RangeError);
    }
  });
});

describe("acceptHistoryLine", () => {
  /** Runs the input line of `step` like the game does: accept, then record. */
  function run(step: HistoryStep): Session {
    return recordHistory(acceptHistoryLine(step.session, step.navigation), step.line);
  }

  test("running an edited entry saves the edit as a new entry and keeps the old one", () => {
    const steps = press(withTwo, "", ["up", { edit: "echo bX" }]);
    const step: HistoryStep = { ...last(steps), line: "echo bX" };
    expect(run(step).history.entries).toEqual([
      { line: "echo a" },
      { line: "echo b" },
      { line: "echo bX" },
    ]);
  });

  test("running a line from an entry edited before gives the entry its original back", () => {
    const keys: Key[] = ["up", { edit: "echo bX" }, "up", "down"];
    const step = last(press(withTwo, "", keys));
    expect(step.line).toBe("echo bX");
    expect(acceptHistoryLine(step.session, step.navigation).history.entries[1]).toEqual({
      line: "echo b",
    });
  });

  test("edits of other entries stay after a line is run", () => {
    const keys: Key[] = ["up", { edit: "echo bX" }, "up", "down", "down"];
    const step = last(press(withTwo, "typing", keys));
    expect(run(step).history.entries).toEqual([
      { line: "echo a" },
      { line: "echo bX", original: "echo b" },
      { line: "typing" },
    ]);
  });

  test("an unedited entry or the new line leave the history as it is", () => {
    const step = last(press(withTwo, "", ["up"]));
    expect(acceptHistoryLine(step.session, step.navigation)).toBe(step.session);
    expect(acceptHistoryLine(withTwo, AT_NEW_LINE)).toBe(withTwo);
  });
});
