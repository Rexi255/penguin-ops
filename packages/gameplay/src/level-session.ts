// The level session (ADR 0077): one ticket being played. It builds the level's world with the
// player's account, runs the player's inputs like an interactive bash, and after every input
// evaluates the level's rules: the goal or the next steps, the extra goals and the tips. The
// session is an immutable value; every input returns a new one.
//
// The session runs complete inputs. An input that bash would continue on the next line (an open
// quote, a trailing `|`) comes back as "incomplete" without any change; the terminal asks for
// the next line and submits the input again with it. History navigation and completion work on
// the session's shell (`shell`); the terminal replaces it in the session before submitting.

import type { BaseWorld, Level } from "@penguin-ops/content";
import {
  COMMANDS,
  type CommandLookup,
  complete,
  type Completion,
  createCommandLookup,
  createSession,
  evaluateRule,
  type GameClock,
  lookup,
  type ParseError,
  type ParseMissingInput,
  parse,
  recordHistory,
  type Rule,
  runScript,
  type Session,
  setVariable,
  type ShellEvent,
  type Terminal,
  terminalOutput,
  TIME_PER_INPUT,
  toGid,
  toUid,
  type UnsupportedFeature,
  type UnsupportedSyntax,
  type World,
  buildWorld,
  clearHistory,
  findHost,
  findUserByUid,
  interruptInput,
  primaryPrompt,
  type PromptParts,
} from "@penguin-ops/engine";

import { LevelSetupError, levelWorldSpec, startHost } from "./level-world";

/** What a level session needs to start. */
export interface LevelSetup {
  readonly level: Level;
  /** The level's base world (`level.world`, or the standard world). */
  readonly world: BaseWorld;
  /** The texts of prose start files in the player's language, by text key. */
  readonly fileTexts: ReadonlyMap<string, string>;
  /** The player's Linux user name (ADR 0019). */
  readonly player: string;
}

/** The state of a level being played. */
export interface LevelSession {
  readonly level: Level;
  readonly world: World;
  /** The player's shell. */
  readonly shell: Session;
  /** How many steps are completed, in order; always 0 for a level with a single goal. */
  readonly completedSteps: number;
  /** Whether the ticket is solved: its goal or its last step was reached. It stays solved. */
  readonly solved: boolean;
  /** The indexes of the tips shown so far, in the order shown. */
  readonly shownTips: readonly number[];
  /** The IDs of the extra goals reached so far, in the order reached. */
  readonly reachedExtraGoals: readonly string[];
}

/** What the terminal shows for an input: the shell's events, or syntax the game lacks. */
export type TerminalEvent =
  | ShellEvent
  | {
      /**
       * The input uses bash syntax that the game does not simulate yet (ADR 0045); nothing ran.
       * The UI explains it with a game notice.
       */
      readonly kind: "syntax-unsupported";
      readonly feature: UnsupportedFeature | UnsupportedSyntax;
      /** The offset in the input where the feature starts. */
      readonly start: number;
    };

/** What happened in the game after an input, in this order. */
export type GameEvent =
  /**
   * The player asked for the ticket's next hint with the game command `hint`, once per `hint`
   * that ran (ADR 0103). The UI counts the hints, as for F1.
   */
  | { readonly kind: "hint-requested" }
  /** A step of a multi-step ticket was completed; `say` is the text key of its message. */
  | { readonly kind: "step-completed"; readonly step: string; readonly say?: string }
  /** The ticket was solved. */
  | { readonly kind: "solved" }
  /** An extra goal was reached. */
  | { readonly kind: "extra-goal"; readonly id: string; readonly xp: number }
  /** A tip for a typical mistake; `say` is its text key. */
  | { readonly kind: "tip"; readonly say: string };

/** The result of submitting an input. */
export type InputResult =
  | {
      /** The input needs another line; the session is unchanged. */
      readonly kind: "incomplete";
      readonly missing: ParseMissingInput;
    }
  | {
      readonly kind: "ran";
      readonly session: LevelSession;
      readonly terminal: readonly TerminalEvent[];
      readonly game: readonly GameEvent[];
    };

/** What running an input needs besides the session. */
export interface InputOptions {
  /** The game clock; every input moves it forward by `TIME_PER_INPUT`. */
  readonly clock: GameClock;
  /** The terminal that shows the output. */
  readonly terminal: Terminal;
}

/** The exit status bash sets after a syntax error in an interactive shell (`EX_BADUSAGE`). */
const SYNTAX_ERROR_STATUS = 2;

/** The exit status of an input that the game stops for an unsupported feature (ADR 0047). */
const UNSUPPORTED_STATUS = 1;

/** The terminal width used while a checkpoint is restored; its output is not shown. */
const RESTORE_TERMINAL: Terminal = { columns: 80 };

/** Root's credentials, to find the start directory whatever the player may search. */
const ROOT = { uid: toUid(0), gid: toGid(0), groups: [toGid(0)] };

/** The simulated commands. Created once: a lookup has no state. */
const COMMAND_LOOKUP: CommandLookup = createCommandLookup(COMMANDS);

/**
 * The names of the simulated commands, sorted: the commands the player's `PATH` holds, which
 * Tab completes in command position (ADR 0065).
 */
export const COMMAND_NAMES: readonly string[] = COMMANDS.map((command) => command.name);

/**
 * Starts a level: builds its world with the player's account (`levelWorldSpec`) at the clock's
 * time, and logs the player in on the start host in the start directory (`start.cwd`, which
 * must be a directory; `~` is the player's home). Nothing is evaluated yet: a level is never
 * solved at its start (the content tests check that).
 *
 * With `checkpoint`, the ID of a completed step, the level resumes after that step (ADR 0013):
 * the first reference solution is played until the step is completed, then the history is
 * cleared; tips and extra goals of that replay do not count.
 *
 * Throws a LevelSetupError if the level cannot start (see `levelWorldSpec`), if the start
 * directory is not a directory, or if the checkpoint is not a step that the first reference
 * solution completes. Throws the engine's InvalidWorldError if the world cannot be built.
 */
export function startLevel(setup: LevelSetup, clock: GameClock, checkpoint?: string): LevelSession {
  const { level, world: baseWorld, player } = setup;
  const world = buildWorld(levelWorldSpec(baseWorld, level, player, setup.fileTexts), clock);
  const host = startHost(baseWorld, level).name;
  const shell = inStartDirectory(world, createSession(world, host, player), level.start.cwd);
  const session: LevelSession = {
    level,
    world,
    shell,
    completedSteps: 0,
    solved: false,
    shownTips: [],
    reachedExtraGoals: [],
  };
  return checkpoint === undefined ? session : restoreCheckpoint(session, checkpoint, clock);
}

/**
 * Runs an input of the player like interactive bash 5.2 runs a line:
 *
 * - An input that needs another line (open quote, trailing `|`, `&&` or `||`, a trailing
 *   backslash) gives "incomplete"; nothing changes, not even the history.
 * - Every other input is saved in the history (`recordHistory`; bash saves lines with syntax
 *   errors too) and moves the clock forward by `TIME_PER_INPUT`.
 * - A syntax error writes ``bash: syntax error near unexpected token `…'`` to standard error and
 *   sets the exit status to 2; bash syntax that the game does not simulate gives a
 *   "syntax-unsupported" event and exit status 1. Neither runs a command.
 * - Any other input runs with `runScript`.
 *
 * Then the rules are evaluated against the world, the shell and the output of the input (see
 * `evaluate`), and the game events are returned, after a `hint-requested` event for every game
 * command `hint` that showed its output.
 */
export function runInput(session: LevelSession, input: string, options: InputOptions): InputResult {
  const parsed = parse(input);
  if (!parsed.ok && parsed.error.kind === "incomplete") {
    return { kind: "incomplete", missing: parsed.error.missing };
  }
  const shell = recordHistory(session.shell, input);
  const ran = parsed.ok
    ? runScript({
        world: session.world,
        session: shell,
        script: parsed.script,
        commands: COMMAND_LOOKUP,
        clock: options.clock,
        terminal: options.terminal,
      })
    : rejectInput(session.world, shell, parsed.error, options.clock);
  const shellEvents = ran.events.filter((event) => event.kind !== "syntax-unsupported");
  const { session: evaluated, game } = evaluate(
    { ...session, world: ran.world, shell: ran.session },
    terminalOutput(shellEvents),
  );
  const hints = shellEvents
    .filter((event) => event.kind === "game-output" && event.output.kind === "hint")
    .map((): GameEvent => ({ kind: "hint-requested" }));
  return { kind: "ran", session: evaluated, terminal: ran.events, game: [...hints, ...game] };
}

/** The primary prompt of the player's shell (Debian 13's `PS1`, see `primaryPrompt`). */
export function levelPrompt(session: LevelSession): PromptParts {
  return primaryPrompt(session.world, session.shell);
}

/**
 * Tab completion of the input line `line` with the cursor at `cursor` in the player's shell,
 * with the simulated commands as the command names (`complete`, ADR 0065). Throws a RangeError
 * if the cursor is not inside the line.
 */
export function completeInput(session: LevelSession, line: string, cursor: number): Completion {
  return complete({
    world: session.world,
    session: session.shell,
    commandNames: COMMAND_NAMES,
    line,
    cursor,
  });
}

/**
 * Ctrl+C at the prompt (ADR 0095): the input is dropped and the shell's exit status becomes 130
 * (`interruptInput`). Nothing runs, the clock stands still and no rule is evaluated, because
 * nothing in the world or the output changed.
 */
export function interruptLevelInput(session: LevelSession): LevelSession {
  return { ...session, shell: interruptInput(session.shell) };
}

/**
 * An input that did not parse and runs no command: a syntax error as bash reports it, or a
 * game notice for unsupported syntax. The clock moves forward as for any input.
 */
function rejectInput(
  world: World,
  shell: Session,
  error: ParseError,
  clock: GameClock,
): { readonly world: World; readonly session: Session; readonly events: TerminalEvent[] } {
  clock.advance(TIME_PER_INPUT);
  switch (error.kind) {
    case "incomplete":
      // runInput returns before; an incomplete input never runs.
      throw new Error("an incomplete input cannot be rejected");
    case "syntax":
      return {
        world,
        session: { ...shell, exitStatus: SYNTAX_ERROR_STATUS },
        events: [
          {
            kind: "output",
            stream: "stderr",
            text: `bash: syntax error near unexpected token \`${error.near}'\n`,
          },
        ],
      };
    case "unsupported":
      return {
        world,
        session: { ...shell, exitStatus: UNSUPPORTED_STATUS },
        events: [{ kind: "syntax-unsupported", feature: error.feature, start: error.start }],
      };
  }
}

/**
 * The ID of the last completed step, which save games keep as the checkpoint (ADR 0013), or
 * `undefined` if no step is completed or the level has a single goal.
 */
export function lastCompletedStep(session: LevelSession): string | undefined {
  const { steps } = session.level;
  if (steps === undefined || session.completedSteps === 0) {
    return undefined;
  }
  return steps[session.completedSteps - 1]?.id;
}

/**
 * Evaluates the level's rules after an input whose terminal output was `output`:
 *
 * 1. Until the ticket is solved: a level with a goal is solved when the goal holds. In a
 *    multi-step ticket, the next step is completed when its goal holds, then the step after it
 *    is checked against the same state, and so on; the ticket is solved with its last step.
 * 2. Every extra goal that is not reached yet and holds is reached, also after the ticket is
 *    solved.
 * 3. While the ticket is still not solved, every tip that was not shown yet and holds is shown.
 *
 * Each rule sees the world, the shell and the output of this input (ADR 0067).
 */
export function evaluate(
  session: LevelSession,
  output: string,
): { readonly session: LevelSession; readonly game: readonly GameEvent[] } {
  const holds = (rule: Rule): boolean =>
    evaluateRule(rule, { world: session.world, session: session.shell, output });
  const { level } = session;
  const game: GameEvent[] = [];
  let { completedSteps, solved } = session;

  if (!solved) {
    if (level.steps === undefined) {
      solved = holds(level.goal);
    } else {
      for (let step = level.steps[completedSteps]; step !== undefined;) {
        if (!holds(step.goal)) {
          break;
        }
        completedSteps += 1;
        game.push({
          kind: "step-completed",
          step: step.id,
          ...(step.say === undefined ? {} : { say: step.say }),
        });
        step = level.steps[completedSteps];
      }
      solved = completedSteps === level.steps.length;
    }
    if (solved) {
      game.push({ kind: "solved" });
    }
  }

  const reachedExtraGoals = [...session.reachedExtraGoals];
  for (const goal of level.extraGoals) {
    if (!reachedExtraGoals.includes(goal.id) && holds(goal.when)) {
      reachedExtraGoals.push(goal.id);
      game.push({ kind: "extra-goal", id: goal.id, xp: goal.xp });
    }
  }

  const shownTips = [...session.shownTips];
  if (!solved) {
    level.tips.forEach((tip, index) => {
      if (!shownTips.includes(index) && holds(tip.when)) {
        shownTips.push(index);
        game.push({ kind: "tip", say: tip.say });
      }
    });
  }

  return {
    session: { ...session, completedSteps, solved, shownTips, reachedExtraGoals },
    game,
  };
}

/** The shell moved to the level's start directory, as `cd` would: `cwd` and `PWD`. */
function inStartDirectory(world: World, shell: Session, cwd: string): Session {
  const host = findHost(world, shell.host);
  const user = host === undefined ? undefined : findUserByUid(host, shell.credentials.uid);
  if (host === undefined || user === undefined) {
    throw new LevelSetupError(`the player's account is missing on the host "${shell.host}"`);
  }
  const path = cwd === "~" ? user.home : cwd.startsWith("~/") ? `${user.home}${cwd.slice(1)}` : cwd;
  const found = lookup(host.root, ROOT, "/", path);
  if (!found.ok || found.node.kind !== "directory") {
    throw new LevelSetupError(`the start directory "${cwd}" is not a directory of the world`);
  }
  return setVariable({ ...shell, cwd: found.path }, "PWD", found.path);
}

/**
 * Plays the level's first reference solution from the start until the step `checkpoint` is
 * completed, then clears the history, the tips and the extra goals of the replay.
 */
function restoreCheckpoint(
  start: LevelSession,
  checkpoint: string,
  clock: GameClock,
): LevelSession {
  const steps = start.level.steps ?? [];
  const index = steps.findIndex((step) => step.id === checkpoint);
  if (index === -1) {
    throw new LevelSetupError(`the level "${start.level.id}" has no step "${checkpoint}"`);
  }
  let session = start;
  for (const line of start.level.solutions[0] ?? []) {
    const result = runInput(session, line, { clock, terminal: RESTORE_TERMINAL });
    if (result.kind === "ran") {
      session = result.session;
    }
    if (session.completedSteps > index) {
      return {
        ...session,
        shell: { ...session.shell, history: clearHistory(session.shell.history) },
        shownTips: [],
        reachedExtraGoals: [],
      };
    }
  }
  throw new LevelSetupError(
    `the first reference solution of the level "${start.level.id}" does not complete the step "${checkpoint}"`,
  );
}
