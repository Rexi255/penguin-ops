import { type Content, formatProblem, loadContent } from "@penguin-ops/content";
import { createGameClock, findHost, lookup, toGid, toUid } from "@penguin-ops/engine";
import { describe, expect, test } from "vitest";

import { levelSetup } from "./developer-mode";
import { lastCompletedStep, type LevelSession } from "./level-session";
import { GAME_START_TIME } from "./new-game";
import { fitSaveToContent, newTicketRecord, resumeTicket } from "./resume";
import type { SaveGame, TicketRecord } from "./save-game";

function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

/** The catalog of a level: its own texts and these extra lines. */
const catalog = (...lines: string[]) =>
  yaml("title: T", "ticket: T", "hints: [a, b, c]", "explanation: { text: E }", ...lines);

/** The extra catalog lines of each level of the test content. */
const CATALOG_LINES: Readonly<Record<string, readonly string[]>> = {
  single: ["extra_goals: { tidy: X }"],
  multi: ["step-a: A", "extra_goals: { tidy: X }"],
  later: [],
};

/**
 * Content with the chapters `one` (`single`, a level with one goal, and `multi`, three steps)
 * and `two` (`later`, one goal).
 */
function loadTestContent(): Content {
  const ui = yaml("app:", "  name: PenguinOps", "chapters:", "  one: One", "  two: Two");
  const level = (id: string, ...lines: string[]) => ({
    file: `content/levels/${id}/level.yaml`,
    text: yaml("format: 1", `id: ${id}`, "kind: main", "teaches: [mkdir]", ...lines),
  });
  const result = loadContent({
    chapters: {
      file: "content/chapters.yaml",
      text: yaml(
        "format: 1",
        "chapters:",
        "  - id: one",
        "    levels: [single, multi]",
        "  - id: two",
        "    levels: [later]",
      ),
    },
    levels: [
      level(
        "single",
        "goal: { dir_exists: ~/done }",
        "extra_goals:",
        "  - id: tidy",
        "    when: { dir_exists: ~/tidy }",
        "    xp: 10",
        "solutions:",
        "  - [mkdir done]",
      ),
      level(
        "multi",
        "steps:",
        "  - id: a",
        "    goal: { dir_exists: ~/a }",
        "    say: step-a",
        "  - id: b",
        "    goal: { dir_exists: ~/b }",
        "  - id: c",
        "    goal: { dir_exists: ~/c }",
        "extra_goals:",
        "  - id: tidy",
        "    when: { dir_exists: ~/tidy }",
        "    xp: 10",
        "solutions:",
        "  - [mkdir a, mkdir tidy, mkdir b, mkdir c]",
      ),
      level("later", "goal: { dir_exists: ~/later }", "solutions:", "  - [mkdir later]"),
    ],
    levelCatalogs: Object.entries(CATALOG_LINES).flatMap(([id, lines]) =>
      ["en", "de"].map((language) => ({
        file: `content/levels/${id}/${language}.yaml`,
        text: catalog(...lines),
      })),
    ),
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

const record = (level: string, fields: Partial<TicketRecord> = {}): TicketRecord => ({
  ...newTicketRecord(level),
  ...fields,
});

function save(fields: Partial<SaveGame>): SaveGame {
  return {
    playerName: "Alice",
    userName: "alice",
    mode: "story",
    gameTime: GAME_START_TIME,
    playTime: 0,
    lastPlayed: 0,
    currentTicket: "single",
    tickets: [record("single")],
    ...fields,
  };
}

describe("newTicketRecord", () => {
  test("is an unsolved ticket without hints, checkpoint or extra goals", () => {
    expect(newTicketRecord("multi")).toEqual({
      level: "multi",
      solved: false,
      hintsShown: 0,
      reachedExtraGoals: [],
    });
  });
});

describe("fitSaveToContent", () => {
  test("keeps a save that fits the content as it is", () => {
    const fitting = save({
      currentTicket: "multi",
      tickets: [
        record("single", { solved: true, hintsShown: 2, reachedExtraGoals: ["tidy"] }),
        record("multi", { checkpoint: "b", hintsShown: 1 }),
      ],
    });
    expect(fitSaveToContent(CONTENT, fitting)).toEqual(fitting);
  });

  test("drops the tickets of levels the content no longer has", () => {
    const fitted = fitSaveToContent(CONTENT, save({ tickets: [record("gone"), record("single")] }));
    expect(fitted.tickets).toEqual([record("single")]);
  });

  test("drops a checkpoint that is no longer a step of its level", () => {
    const fitted = fitSaveToContent(
      CONTENT,
      save({
        currentTicket: "multi",
        tickets: [record("single", { checkpoint: "a" }), record("multi", { checkpoint: "gone" })],
      }),
    );
    expect(fitted.tickets).toEqual([record("single"), record("multi")]);
  });

  test("gives a solved ticket with steps its last step as the checkpoint", () => {
    const fitted = fitSaveToContent(
      CONTENT,
      save({ tickets: [record("single"), record("multi", { solved: true, checkpoint: "a" })] }),
    );
    expect(fitted.tickets[1]).toEqual(record("multi", { solved: true, checkpoint: "c" }));
  });

  test("drops reached extra goals that the level no longer has", () => {
    const fitted = fitSaveToContent(
      CONTENT,
      save({ tickets: [record("single", { reachedExtraGoals: ["gone", "tidy"] })] }),
    );
    expect(fitted.tickets[0]?.reachedExtraGoals).toEqual(["tidy"]);
  });

  test("moves a dropped current ticket to the first unsolved open ticket", () => {
    const fitted = fitSaveToContent(
      CONTENT,
      save({
        currentTicket: "gone",
        tickets: [record("single", { solved: true }), record("gone")],
      }),
    );
    expect(fitted.currentTicket).toBe("multi");
    expect(fitted.tickets).toEqual([record("single", { solved: true }), record("multi")]);
  });

  test("moves a current ticket of a chapter that is not open in Story mode", () => {
    const fitted = fitSaveToContent(
      CONTENT,
      save({ currentTicket: "later", tickets: [record("single"), record("later")] }),
    );
    expect(fitted.currentTicket).toBe("single");
    expect(fitted.tickets).toEqual([record("single"), record("later")]);
  });

  test("keeps that current ticket in Sandbox mode, where every chapter is open", () => {
    const sandbox = save({
      mode: "sandbox",
      currentTicket: "later",
      tickets: [record("single"), record("later")],
    });
    expect(fitSaveToContent(CONTENT, sandbox)).toEqual(sandbox);
  });

  test("takes the first open ticket when every open ticket is solved", () => {
    const fitted = fitSaveToContent(
      CONTENT,
      save({
        mode: "sandbox",
        currentTicket: "gone",
        tickets: [
          record("single", { solved: true }),
          record("multi", { solved: true, checkpoint: "c" }),
          record("later", { solved: true }),
          record("gone"),
        ],
      }),
    );
    expect(fitted.currentTicket).toBe("single");
    expect(fitted.tickets).toHaveLength(3);
  });

  test("fails for content without a chapter level, which the loader never returns", () => {
    expect(() =>
      fitSaveToContent({ ...CONTENT, chapters: [] }, save({ currentTicket: "single" })),
    ).toThrow("the content has no chapter with a level");
  });
});

describe("resumeTicket", () => {
  const setup = (level: string) => levelSetup(CONTENT, level, "en", "alice");
  const clock = () => createGameClock(GAME_START_TIME);

  /** Whether the player's home on the start host holds the directory `name`. */
  function hasDirectory(session: LevelSession, name: string): boolean {
    const host = findHost(session.world, session.shell.host);
    if (host === undefined) {
      return false;
    }
    const root = { uid: toUid(0), gid: toGid(0), groups: [toGid(0)] };
    const found = lookup(host.root, root, "/", `/home/alice/${name}`);
    return found.ok && found.node.kind === "directory";
  }

  test("starts a new ticket from the beginning", () => {
    const session = resumeTicket(setup("multi"), clock(), record("multi"));
    expect(session.completedSteps).toBe(0);
    expect(session.solved).toBe(false);
    expect(session.reachedExtraGoals).toEqual([]);
    expect(hasDirectory(session, "a")).toBe(false);
  });

  test("resumes at the checkpoint with the extra goals the player had reached", () => {
    const session = resumeTicket(
      setup("multi"),
      clock(),
      record("multi", { checkpoint: "b", reachedExtraGoals: [] }),
    );
    expect(lastCompletedStep(session)).toBe("b");
    expect(session.solved).toBe(false);
    // The replay reached the extra goal `tidy`, which the player had not reached.
    expect(session.reachedExtraGoals).toEqual([]);
    expect(hasDirectory(session, "b")).toBe(true);
    expect(session.shell.history.entries).toEqual([]);
  });

  test("keeps a reached extra goal reached", () => {
    const session = resumeTicket(
      setup("single"),
      clock(),
      record("single", { reachedExtraGoals: ["tidy"] }),
    );
    expect(session.reachedExtraGoals).toEqual(["tidy"]);
  });

  test("resumes a solved ticket with steps solved in the world of its solution", () => {
    const session = resumeTicket(
      setup("multi"),
      clock(),
      record("multi", { solved: true, checkpoint: "c" }),
    );
    expect(session.solved).toBe(true);
    expect(session.completedSteps).toBe(3);
    expect(hasDirectory(session, "c")).toBe(true);
  });

  test("resumes a solved ticket with one goal solved in its start world", () => {
    const session = resumeTicket(setup("single"), clock(), record("single", { solved: true }));
    expect(session.solved).toBe(true);
    expect(session.completedSteps).toBe(0);
    expect(hasDirectory(session, "done")).toBe(false);
  });

  test("moves the clock on by the replayed inputs", () => {
    const gameClock = clock();
    resumeTicket(setup("multi"), gameClock, record("multi", { checkpoint: "a" }));
    expect(gameClock.now()).toBeGreaterThan(GAME_START_TIME);
  });
});
