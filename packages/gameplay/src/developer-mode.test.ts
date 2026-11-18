import { type Content, type ContentFile, formatProblem, loadContent } from "@penguin-ops/content";
import { createGameClock, type GameClock, terminalOutput } from "@penguin-ops/engine";
import { describe, expect, test } from "vitest";

import {
  autoPlay,
  DeveloperModeError,
  inspectRules,
  levelSetup,
  type RuleState,
  startAtStep,
} from "./developer-mode";
import { type InputOptions, type LevelSession, runInput } from "./level-session";

function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

/** A catalog with the level's own texts and these extra lines. */
function catalog(...lines: string[]): string {
  return yaml("title: T", "ticket: T", "hints: [a, b, c]", "explanation: { text: E }", ...lines);
}

/** Loads content with the levels `single` (one goal) and `multi` (three steps). */
function loadTestContent(extra: readonly ContentFile[] = []): Content {
  const ui = yaml("app:", "  name: PenguinOps");
  const result = loadContent({
    chapters: {
      file: "content/chapters.yaml",
      text: yaml("format: 1", "chapters:", "  - id: a", "    levels: [single, multi]"),
    },
    levels: [
      {
        file: "content/levels/single/level.yaml",
        text: yaml(
          "format: 1",
          "id: single",
          "kind: main",
          "teaches: [cd]",
          "start:",
          "  files:",
          "    ~/note.txt: { text: note }",
          "    ~/docs/: {}",
          "goal:",
          "  all:",
          "    - cwd_is: ~/docs",
          "    - not: { exists: ~/note.txt }",
          "tips:",
          "  - when: { output_contains: No such file }",
          "    say: tip-spelling",
          "extra_goals:",
          "  - id: listed",
          "    when: { output_contains: note.txt }",
          "    xp: 10",
          "solutions:",
          "  - [rm note.txt, cd docs, ls ~]",
          '  - ["echo \\"open"]',
        ),
      },
      {
        file: "content/levels/multi/level.yaml",
        text: yaml(
          "format: 1",
          "id: multi",
          "kind: main",
          "teaches: [mkdir]",
          "steps:",
          "  - id: first",
          "    goal: { dir_exists: ~/a }",
          "  - id: second",
          "    goal: { dir_exists: ~/b }",
          "  - id: third",
          "    goal: { dir_exists: ~/c }",
          "solutions:",
          "  - [mkdir a, mkdir b, mkdir c]",
        ),
      },
    ],
    levelCatalogs: [
      {
        file: "content/levels/single/en.yaml",
        text: catalog("note: English note", "tip-spelling: S", "extra_goals: { listed: L }"),
      },
      {
        file: "content/levels/single/de.yaml",
        text: catalog("note: Deutsche Notiz", "tip-spelling: S", "extra_goals: { listed: L }"),
      },
      { file: "content/levels/multi/en.yaml", text: catalog() },
      { file: "content/levels/multi/de.yaml", text: catalog() },
      ...extra,
    ],
    uiCatalogs: [
      { file: "content/ui/en.yaml", text: ui },
      { file: "content/ui/de.yaml", text: ui },
    ],
    worlds: [
      {
        file: "content/worlds/office.yaml",
        text: yaml(
          "format: 1",
          "id: office",
          "hosts:",
          "  - name: desk",
          "    groups: [{ name: root, gid: 0 }]",
          "    users: [{ name: root, uid: 0 }]",
        ),
      },
    ],
  });
  if (!result.ok) {
    throw new Error(result.problems.map(formatProblem).join("\n"));
  }
  return result.value;
}

const CONTENT = loadTestContent();

function clock(): GameClock {
  return createGameClock(1_767_600_000_000);
}

function options(): InputOptions {
  return { clock: clock(), terminal: { columns: 80 } };
}

function start(level: string, step?: string): LevelSession {
  return startAtStep(levelSetup(CONTENT, level, "en", "alice"), clock(), step);
}

/** Runs a complete input and returns the session and its output. */
function run(session: LevelSession, input: string): { session: LevelSession; output: string } {
  const result = runInput(session, input, options());
  if (result.kind !== "ran") {
    throw new Error(`the input "${input}" is incomplete`);
  }
  const events = result.terminal.flatMap((event) =>
    event.kind === "syntax-unsupported" ? [] : [event],
  );
  return { session: result.session, output: terminalOutput(events) };
}

/** The rule state reduced to the kinds and whether they hold, for readable expectations. */
function summary(state: RuleState): unknown {
  const own = `${state.rule.kind}: ${String(state.holds)}`;
  return state.parts.length === 0 ? own : { [own]: state.parts.map(summary) };
}

describe("levelSetup", () => {
  test("gives the level, its world and the file texts in the language", () => {
    const setup = levelSetup(CONTENT, "single", "de", "max-2");
    expect(setup.level.id).toBe("single");
    expect(setup.world.id).toBe("office");
    expect(setup.player).toBe("max-2");
    expect(setup.fileTexts.get("note")).toBe("Deutsche Notiz");
  });

  test("falls back to English for a language without a catalog or a text it lacks", () => {
    expect(levelSetup(CONTENT, "single", "fr", "alice").fileTexts.get("note")).toBe("English note");
    const withFrench = loadTestContent([
      { file: "content/levels/single/fr.yaml", text: yaml("title: Titre") },
    ]);
    expect(levelSetup(withFrench, "single", "fr", "alice").fileTexts.get("note")).toBe(
      "English note",
    );
  });

  test("throws a DeveloperModeError for a level that does not exist", () => {
    expect(() => levelSetup(CONTENT, "missing", "en", "alice")).toThrow(
      new DeveloperModeError('there is no level "missing"'),
    );
  });
});

describe("startAtStep", () => {
  test("without a step, starts the level from the beginning", () => {
    const session = start("single");
    expect(session.solved).toBe(false);
    expect(session.shell.cwd).toBe("/home/alice");
  });

  test("the first step starts from the beginning, a later one after the step before it", () => {
    expect(start("multi", "first").completedSteps).toBe(0);
    const third = start("multi", "third");
    expect(third.completedSteps).toBe(2);
    expect(third.solved).toBe(false);
    expect(third.shell.history.entries).toEqual([]);
  });

  test("throws a DeveloperModeError for a step the level does not have", () => {
    expect(() => start("multi", "fourth")).toThrow(
      new DeveloperModeError('the level "multi" has no step "fourth"'),
    );
    expect(() => start("single", "first")).toThrow(
      new DeveloperModeError('the level "single" has no step "first"'),
    );
  });
});

describe("autoPlay", () => {
  test("plays every line of the solution and returns each result", () => {
    const played = autoPlay(start("single"), 1, options());
    expect(played.lines.map((line) => line.line)).toEqual(["rm note.txt", "cd docs", "ls ~"]);
    expect(played.session.solved).toBe(true);
    const games = played.lines.map((line) => (line.result.kind === "ran" ? line.result.game : []));
    expect(games).toEqual([[], [{ kind: "solved" }], []]);
  });

  test("keeps playing after the ticket is solved", () => {
    const solved = autoPlay(start("single"), 1, options()).session;
    const again = autoPlay(solved, 1, options());
    expect(again.session.solved).toBe(true);
    expect(again.lines.map((line) => line.result.kind)).toEqual(["ran", "ran", "ran"]);
    expect(again.session.shell.history).not.toEqual(solved.shell.history);
  });

  test("an incomplete line leaves the session unchanged", () => {
    const session = start("single");
    const played = autoPlay(session, 2, options());
    expect(played.lines).toEqual([
      { line: 'echo "open', result: { kind: "incomplete", missing: "double-quote" } },
    ]);
    expect(played.session).toBe(session);
  });

  test("from a later step, the lines of the earlier steps run again", () => {
    const played = autoPlay(start("multi", "third"), 1, options());
    expect(played.session.solved).toBe(true);
    const first = played.lines[0]?.result;
    expect(first?.kind === "ran" ? first.terminal : []).toEqual([
      {
        kind: "output",
        stream: "stderr",
        text: "mkdir: cannot create directory ‘a’: File exists\n",
      },
    ]);
  });

  test("throws a DeveloperModeError for a solution the level does not have", () => {
    const session = start("single");
    const message = 'the level "single" has no reference solution 3; it has 2 (1 to 2)';
    expect(() => autoPlay(session, 3, options())).toThrow(new DeveloperModeError(message));
    expect(() => autoPlay(session, 0, options())).toThrow(DeveloperModeError);
    expect(() => autoPlay(session, 1.5, options())).toThrow(DeveloperModeError);
  });
});

describe("inspectRules", () => {
  test("shows the goal with the state of every rule inside it", () => {
    const states = inspectRules(start("single"), "");
    expect(states.solved).toBe(false);
    expect(states.steps).toEqual([]);
    expect(states.goal === undefined ? undefined : summary(states.goal)).toEqual({
      "all: false": ["cwd_is: false", { "not: false": ["exists: true"] }],
    });
  });

  test("rules on output see the output given", () => {
    const { session, output } = run(start("single"), "cat missing");
    expect(output).toBe("cat: missing: No such file or directory\n");
    const states = inspectRules(session, output);
    expect(states.tips).toEqual([
      {
        say: "tip-spelling",
        shown: true,
        when: { rule: { kind: "output_contains", text: "No such file" }, holds: true, parts: [] },
      },
    ]);
    expect(inspectRules(session, "").tips[0]?.when.holds).toBe(false);
  });

  test("shows which extra goals are reached and which hold now", () => {
    const listed = run(start("single"), "ls");
    const states = inspectRules(listed.session, listed.output);
    expect(states.extraGoals).toEqual([
      {
        id: "listed",
        xp: 10,
        reached: true,
        when: { rule: { kind: "output_contains", text: "note.txt" }, holds: true, parts: [] },
      },
    ]);
    expect(inspectRules(start("single"), "").extraGoals[0]).toMatchObject({
      reached: false,
      when: { holds: false },
    });
  });

  test("shows completed, current and waiting steps, also a waiting step whose goal holds", () => {
    let session = start("multi");
    session = run(session, "mkdir a").session;
    session = run(session, "mkdir c").session;
    const states = inspectRules(session, "");
    expect(states.goal).toBeUndefined();
    expect(states.steps.map(({ id, status, goal }) => [id, status, goal.holds])).toEqual([
      ["first", "completed", true],
      ["second", "current", false],
      ["third", "waiting", true],
    ]);
  });

  test("shows a solved ticket", () => {
    const solved = autoPlay(start("multi"), 1, options()).session;
    const states = inspectRules(solved, "");
    expect(states.solved).toBe(true);
    expect(states.steps.map((step) => step.status)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
  });
});
