// The developer mode API (ADR 0015, ADR 0079): what the hidden developer mode needs to review
// levels without playing them by hand. It loads any level of the content in any language for
// any player, starts it at any of its steps, plays a reference solution and shows the state of
// every rule of the level. The developer mode UI (ROADMAP M3.16) is built on it; the content
// tests use `levelSetup` too.

import { type Content, DEFAULT_WORLD_ID, levelTexts } from "@penguin-ops/content";
import { evaluateRule, type GameClock, type Rule, type RuleContext } from "@penguin-ops/engine";

import {
  type InputOptions,
  type InputResult,
  type LevelSession,
  type LevelSetup,
  runInput,
  startLevel,
} from "./level-session";

/** A request of the developer mode that the content cannot fulfil. */
export class DeveloperModeError extends Error {
  override name = "DeveloperModeError";
}

/**
 * What `startLevel` needs to start the level `levelId` of `content` for `player`: the level, its
 * base world and the texts of its prose start files in `language`. A language without a
 * catalog, and the texts a further language lacks, fall back to English (ADR 0074).
 *
 * Throws a DeveloperModeError if the content has no level `levelId`.
 */
export function levelSetup(
  content: Content,
  levelId: string,
  language: string,
  player: string,
): LevelSetup {
  const level = content.levels.get(levelId);
  if (level === undefined) {
    throw new DeveloperModeError(`there is no level "${levelId}"`);
  }
  const catalogs = content.levelCatalogs.get(levelId);
  const world = content.worlds.get(level.world ?? DEFAULT_WORLD_ID);
  if (catalogs === undefined || world === undefined) {
    // loadContent never returns a level without catalogs or world.
    throw new Error(`the content has no catalogs or world for the level "${levelId}"`);
  }
  const texts = levelTexts(catalogs, language).texts;
  const fileTexts = new Map([...texts].map(([key, text]) => [key, text.source]));
  return { level, world, fileTexts, player };
}

/**
 * Starts the level of `setup` so that `step` is the step to play next: the first step starts the
 * level from the beginning, every later step resumes at the checkpoint of the step before it
 * (`startLevel`, ADR 0077). Without `step`, the level starts from the beginning.
 *
 * Throws a DeveloperModeError if the level has no step `step` (a level with a single goal has
 * none), and what `startLevel` throws.
 */
export function startAtStep(setup: LevelSetup, clock: GameClock, step?: string): LevelSession {
  if (step === undefined) {
    return startLevel(setup, clock);
  }
  const { level } = setup;
  const steps = level.steps ?? [];
  const index = steps.findIndex((candidate) => candidate.id === step);
  if (index === -1) {
    throw new DeveloperModeError(`the level "${level.id}" has no step "${step}"`);
  }
  return startLevel(setup, clock, steps[index - 1]?.id);
}

/** One command line that `autoPlay` submitted, with what it gave. */
export interface PlayedLine {
  readonly line: string;
  readonly result: InputResult;
}

/** What `autoPlay` gave: the session after the last line and every line played. */
export interface AutoPlay {
  readonly session: LevelSession;
  readonly lines: readonly PlayedLine[];
}

/**
 * Plays the reference solution number `solution` (counted from 1, as the content tests report
 * it) of the session's level: submits each of its command lines in order with `runInput`, also
 * after the ticket is solved, and returns every result for the developer mode to show. A line
 * that comes back "incomplete" leaves the session unchanged (the content tests make sure that
 * reference solutions have none).
 *
 * The lines run on the session as it is. After `startAtStep` with a later step, the lines of
 * the earlier steps run again; their errors (`mkdir: cannot create directory ...: File exists`)
 * are part of the result.
 *
 * Throws a DeveloperModeError if the level has no such reference solution.
 */
export function autoPlay(session: LevelSession, solution: number, options: InputOptions): AutoPlay {
  const { level } = session;
  const lines = Number.isInteger(solution) ? level.solutions[solution - 1] : undefined;
  if (lines === undefined) {
    const count = level.solutions.length;
    throw new DeveloperModeError(
      `the level "${level.id}" has no reference solution ${String(solution)}; it has ${String(count)} (1 to ${String(count)})`,
    );
  }
  let current = session;
  const played: PlayedLine[] = [];
  for (const line of lines) {
    const result = runInput(current, line, options);
    if (result.kind === "ran") {
      current = result.session;
    }
    played.push({ line, result });
  }
  return { session: current, lines: played };
}

/** Whether a rule holds, and for `all`, `any` and `not` whether each of its rules holds. */
export interface RuleState {
  readonly rule: Rule;
  readonly holds: boolean;
  /** The states of the rules inside `all`, `any` and `not`; empty for every other rule. */
  readonly parts: readonly RuleState[];
}

/** Where a step of a multi-step ticket stands. */
export type StepStatus =
  /** The step is completed. */
  | "completed"
  /** The step is the next one to complete. */
  | "current"
  /** A step before it is not completed yet; it waits even if its goal holds. */
  | "waiting";

/** The state of every rule of a level session. */
export interface LevelRuleStates {
  readonly solved: boolean;
  /** The goal of a level with a single goal; unset for a multi-step ticket. */
  readonly goal?: RuleState;
  /** The steps of a multi-step ticket in order; empty for a level with a single goal. */
  readonly steps: readonly {
    readonly id: string;
    readonly status: StepStatus;
    readonly goal: RuleState;
  }[];
  /** The tips in the order of the level, with whether each was shown already. */
  readonly tips: readonly {
    readonly say: string;
    readonly shown: boolean;
    readonly when: RuleState;
  }[];
  /** The extra goals in the order of the level, with whether each was reached already. */
  readonly extraGoals: readonly {
    readonly id: string;
    readonly xp: number;
    readonly reached: boolean;
    readonly when: RuleState;
  }[];
}

/**
 * The state of every rule of the session's level, as the rules see the session's world and
 * shell and `output`, the terminal output of the last input (`terminalOutput`; "" before the
 * first input). It shows what holds now; whether the game has already acted on a rule (a
 * completed step, a shown tip, a reached extra goal) comes from the session.
 */
export function inspectRules(session: LevelSession, output: string): LevelRuleStates {
  const context: RuleContext = { world: session.world, session: session.shell, output };
  const state = (rule: Rule): RuleState => ruleState(rule, context);
  const { level } = session;
  return {
    solved: session.solved,
    ...(level.goal === undefined ? {} : { goal: state(level.goal) }),
    steps: (level.steps ?? []).map((step, index) => ({
      id: step.id,
      status: stepStatus(index, session.completedSteps),
      goal: state(step.goal),
    })),
    tips: level.tips.map((tip, index) => ({
      say: tip.say,
      shown: session.shownTips.includes(index),
      when: state(tip.when),
    })),
    extraGoals: level.extraGoals.map((goal) => ({
      id: goal.id,
      xp: goal.xp,
      reached: session.reachedExtraGoals.includes(goal.id),
      when: state(goal.when),
    })),
  };
}

function stepStatus(index: number, completedSteps: number): StepStatus {
  if (index < completedSteps) {
    return "completed";
  }
  return index === completedSteps ? "current" : "waiting";
}

function ruleState(rule: Rule, context: RuleContext): RuleState {
  return {
    rule,
    holds: evaluateRule(rule, context),
    parts: innerRules(rule).map((inner) => ruleState(inner, context)),
  };
}

/** The rules inside `all`, `any` and `not`. */
function innerRules(rule: Rule): readonly Rule[] {
  switch (rule.kind) {
    case "all":
    case "any":
      return rule.rules;
    case "not":
      return [rule.rule];
    case "cwd_is":
    case "exists":
    case "file_exists":
    case "dir_exists":
    case "file_contains":
    case "same_content":
    case "output_contains":
    case "output_matches":
      return [];
  }
}
