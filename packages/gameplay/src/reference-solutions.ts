// Plays the reference solutions of every level (ADR 0011, ADR 0078): in every language that the
// level has a catalog for and with two different player names, as the content tests and the
// developer mode need it. A level must start, give no game event before the first input, be
// solved by each of its reference solutions without a tip, without an incomplete command line
// and without anything the game does not simulate, and resume at each of its checkpoints.

import { type Content, DEFAULT_WORLD_ID, levelTexts } from "@penguin-ops/content";
import { createGameClock, type GameClock } from "@penguin-ops/engine";

import {
  evaluate,
  type GameEvent,
  type LevelSession,
  type LevelSetup,
  runInput,
  startLevel,
  type TerminalEvent,
} from "./level-session";

/** Two player names that differ in length and letters, so that no rule can depend on one. */
export const REFERENCE_PLAYERS = ["alice", "max-2"] as const;

/** The game time at which the reference solutions start: 2026-01-05 08:00 UTC. */
export const REFERENCE_START_TIME = 1_767_600_000_000;

/** The terminal width of the reference runs. */
const REFERENCE_COLUMNS = 80;

/** A problem of a level found by playing it. */
export interface SolutionProblem {
  readonly level: string;
  readonly language: string;
  readonly player: string;
  /** The reference solution (counted from 1), unset for problems of the level's start. */
  readonly solution?: number;
  readonly message: string;
}

/**
 * Plays every level of `content` in every language it has a catalog for (English, German and
 * further languages) and with each name of `REFERENCE_PLAYERS`, and returns all problems:
 *
 * - the level cannot start (its world does not build, its start directory is missing, ...);
 * - a game event before the first input: the goal or a step holds, a tip or an extra goal fires;
 * - a reference solution with a command line that is incomplete, uses unsupported syntax or a
 *   feature the game does not simulate, shows a tip, or does not solve the ticket;
 * - a checkpoint (each step but the last) at which the level cannot resume.
 */
export function checkReferenceSolutions(content: Content): SolutionProblem[] {
  const problems: SolutionProblem[] = [];
  for (const [id, level] of content.levels) {
    const catalogs = content.levelCatalogs.get(id);
    const world = content.worlds.get(level.world ?? DEFAULT_WORLD_ID);
    if (catalogs === undefined || world === undefined) {
      // loadContent never returns a level without catalogs or world.
      throw new Error(`the content has no catalogs or world for the level "${id}"`);
    }
    for (const language of ["en", "de", ...catalogs.extra.keys()]) {
      const texts = levelTexts(catalogs, language).texts;
      const fileTexts = new Map([...texts].map(([key, text]) => [key, text.source]));
      for (const player of REFERENCE_PLAYERS) {
        const setup: LevelSetup = { level, world, fileTexts, player };
        const report = (message: string, solution?: number): void => {
          problems.push({
            level: id,
            language,
            player,
            ...(solution === undefined ? {} : { solution }),
            message,
          });
        };
        checkLevel(setup, report);
      }
    }
  }
  return problems;
}

/** Formats a problem: `level "id" (de, player "alice"), solution 1: message`. */
export function formatSolutionProblem(problem: SolutionProblem): string {
  const solution = problem.solution === undefined ? "" : `, solution ${String(problem.solution)}`;
  return `level "${problem.level}" (${problem.language}, player "${problem.player}")${solution}: ${problem.message}`;
}

type Report = (message: string, solution?: number) => void;

function checkLevel(setup: LevelSetup, report: Report): void {
  const start = tryStart(setup, newClock(), undefined, report);
  if (start === undefined) {
    return;
  }
  for (const event of evaluate(start, "").game) {
    report(`${describeEvent(event)} before the first input`);
  }
  setup.level.solutions.forEach((solution, index) => {
    playSolution(setup, solution, (message) => {
      report(message, index + 1);
    });
  });
  for (const step of (setup.level.steps ?? []).slice(0, -1)) {
    tryStart(setup, newClock(), step.id, report);
  }
}

/** Plays one reference solution from the start and reports its problems. */
function playSolution(setup: LevelSetup, solution: readonly string[], report: Report): void {
  const clock = newClock();
  let session: LevelSession | undefined = tryStart(setup, clock, undefined, report);
  if (session === undefined) {
    return;
  }
  for (const line of solution) {
    const result = runInput(session, line, { clock, terminal: { columns: REFERENCE_COLUMNS } });
    if (result.kind === "incomplete") {
      report(`the command line \`${line}\` is incomplete (${result.missing} missing)`);
      continue;
    }
    session = result.session;
    for (const event of result.terminal) {
      const unsimulated = unsimulatedFeature(event);
      if (unsimulated !== undefined) {
        report(`the command line \`${line}\` uses ${unsimulated}`);
      }
    }
    for (const event of result.game) {
      if (event.kind === "tip") {
        report(`the command line \`${line}\` shows the tip "${event.say}"`);
      }
    }
  }
  if (!session.solved) {
    report("the ticket is not solved after the solution");
  }
}

/** Starts the level, or reports why it cannot start. */
function tryStart(
  setup: LevelSetup,
  clock: GameClock,
  checkpoint: string | undefined,
  report: Report,
): LevelSession | undefined {
  try {
    return startLevel(setup, clock, checkpoint);
  } catch (error) {
    const where = checkpoint === undefined ? "the level" : `the checkpoint "${checkpoint}"`;
    report(`${where} cannot start: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** What an event says the game does not simulate, or `undefined` for ordinary output. */
function unsimulatedFeature(event: TerminalEvent): string | undefined {
  switch (event.kind) {
    case "output":
    case "clear-screen":
      return undefined;
    case "syntax-unsupported":
      return `syntax the game does not simulate (${event.feature})`;
    case "unsupported":
      return `a shell feature the game does not simulate (${event.feature})`;
    case "notice":
      return `something "${event.command}" does not simulate (${event.notice.key})`;
  }
}

function describeEvent(event: GameEvent): string {
  switch (event.kind) {
    case "solved":
      return "the ticket is solved";
    case "step-completed":
      return `the step "${event.step}" is completed`;
    case "extra-goal":
      return `the extra goal "${event.id}" is reached`;
    case "tip":
      return `the tip "${event.say}" is shown`;
  }
}

function newClock(): GameClock {
  return createGameClock(REFERENCE_START_TIME);
}
