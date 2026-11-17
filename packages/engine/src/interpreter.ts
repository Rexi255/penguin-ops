// Interpreter of the shell, execution part (ADR 0007, ADR 0047): runs the syntax tree of the
// parser like bash. And-or lists run in order, `&&` and `||` look at the exit status of the
// previous pipeline, and the commands of a pipeline run one after the other with the output of
// one as the input of the next. Assignments set shell variables or, before a command name, only
// the variables that command sees. Redirections follow with ROADMAP M1.6c.

import type { Clock, GameClock } from "./clock";
import { expandAssignment, expandWords, type UnsupportedParameter } from "./expand";
import type { AndOrList, Assignment, Pipeline, Script, SimpleCommand } from "./parser";
import type { Session } from "./session";
import type { World } from "./world";

/** The output streams of a command. */
export type OutputStream = "stdout" | "stderr";

/** What a command gets when it runs. */
export interface CommandContext {
  readonly world: World;
  /** The session with the assignments written before the command name. */
  readonly session: Session;
  /** The command name as the player wrote it (after expansion). */
  readonly name: string;
  /** The arguments after the command name (after expansion). */
  readonly args: readonly string[];
  /**
   * The text from the previous command of a pipeline, or `undefined` if standard input is the
   * terminal. The game does not simulate typing into a running command.
   */
  readonly stdin: string | undefined;
  /** The game time; commands may read it (for example for mtimes), but never advance it. */
  readonly clock: Clock;
  /** Writes `text` to the command's standard output. */
  readonly stdout: (text: string) => void;
  /** Writes `text` to the command's standard error. */
  readonly stderr: (text: string) => void;
}

/**
 * What a command returns: its exit status (a whole number from 0 to 255), and the changed world
 * and session if it changed them. A missing `world` or `session` means unchanged. The
 * interpreter sets the session's `exitStatus` itself.
 */
export interface CommandResult {
  readonly exitStatus: number;
  readonly world?: World;
  readonly session?: Session;
}

/** A simulated command. The command framework (ROADMAP M1.7) builds commands on this. */
export type ShellCommand = (context: CommandContext) => CommandResult;

/** Finds the command for a command name, or `undefined` if there is none. */
export type CommandLookup = (name: string) => ShellCommand | undefined;

/** Shell features the interpreter does not simulate yet. */
export type UnsupportedExecution =
  | UnsupportedParameter
  /** `<`, `>` and `>>`: follow with ROADMAP M1.6c. */
  | "redirection"
  /** A command name with a `/`, such as `./run.sh` or `/bin/ls`: needs executable files. */
  | "command-path";

/**
 * What the shell shows while it runs an input, in order: output of commands to the terminal,
 * and game notices that the UI renders in the player's language. Consecutive output to the same
 * stream is merged into one event.
 */
export type ShellEvent =
  | { readonly kind: "output"; readonly stream: OutputStream; readonly text: string }
  | {
      readonly kind: "unsupported";
      readonly feature: UnsupportedExecution;
      /** The offset in the input where the unsupported feature starts. */
      readonly start: number;
    };

/** What `runScript` needs. */
export interface ScriptRun {
  readonly world: World;
  readonly session: Session;
  readonly script: Script;
  readonly commands: CommandLookup;
  /** The game clock, which `runScript` advances by `TIME_PER_INPUT` before it runs the input. */
  readonly clock: GameClock;
}

/** The state after an input: the changed world and session, and what the terminal shows. */
export interface ScriptResult {
  readonly world: World;
  /** The session after the input; its `exitStatus` is what `$?` expands to next. */
  readonly session: Session;
  readonly events: readonly ShellEvent[];
}

/** How far the game clock moves for each input the player runs: one second, in milliseconds. */
export const TIME_PER_INPUT = 1000;

/** The exit status of a command that bash cannot find. */
const COMMAND_NOT_FOUND = 127;

/** The exit status bash returns when an expansion error stops an input. */
const ABORT_STATUS = 1;

/** Stops the rest of an input after an unsupported feature, as bash does after expansion errors. */
class Abort extends Error {
  constructor(
    readonly feature: UnsupportedExecution,
    readonly start: number,
  ) {
    super(`unsupported: ${feature}`);
  }
}

/** The world and the session between two commands. */
interface ShellState {
  readonly world: World;
  readonly session: Session;
}

/**
 * Runs `script` like an interactive bash runs one input:
 *
 * - The game clock moves forward by `TIME_PER_INPUT` first, once per input, so files changed by
 *   different inputs get different mtimes.
 * - And-or lists run in order. `&&` runs the next pipeline only after exit status 0, `||` only
 *   after any other status; a skipped pipeline keeps the status of the previous one.
 * - A pipeline runs its commands from left to right. The standard output of each command is the
 *   standard input of the next; standard error and the output of the last command go to the
 *   terminal. Its exit status is that of the last command. In a pipeline of two or more commands
 *   every command runs in a subshell: their changes to the session (variables, working
 *   directory) are lost, while their changes to the world (files) stay.
 * - A simple command expands its words first, then its assignments from left to right. Without a
 *   command name the assignments set shell variables (exit status 0). Before a command name
 *   they set the variables only for that command and are restored afterwards.
 * - An unknown command writes `bash: NAME: command not found` and has exit status 127.
 *
 * Expansion errors, redirections (ROADMAP M1.6c) and command names with a `/` stop the rest of
 * the input with an "unsupported" event and exit status 1. Throws an Error if a command returns
 * an exit status outside 0 to 255, or if the session's host is not part of the world.
 */
export function runScript(run: ScriptRun): ScriptResult {
  run.clock.advance(TIME_PER_INPUT);
  const runner = new Runner(run.commands, run.clock);
  let state: ShellState = { world: run.world, session: run.session };
  try {
    for (const list of run.script.lists) {
      state = runner.runAndOrList(state, list);
    }
  } catch (failure) {
    if (!(failure instanceof Abort)) {
      throw failure;
    }
    runner.events.push({ kind: "unsupported", feature: failure.feature, start: failure.start });
    state = withExitStatus(runner.lastState ?? state, ABORT_STATUS);
  }
  return { world: state.world, session: state.session, events: runner.events };
}

function withExitStatus(state: ShellState, exitStatus: number): ShellState {
  return { world: state.world, session: { ...state.session, exitStatus } };
}

function withVariable(session: Session, name: string, value: string | undefined): Session {
  const variables = new Map(session.variables);
  if (value === undefined) {
    variables.delete(name);
  } else {
    variables.set(name, value);
  }
  return { ...session, variables };
}

/** Where a command writes its output. */
interface Output {
  write(stream: OutputStream, text: string): void;
}

/** The output of a command inside a pipeline, merged into chunks of consecutive output. */
class OutputBuffer implements Output {
  readonly events: { stream: OutputStream; text: string }[] = [];

  write(stream: OutputStream, text: string): void {
    if (text === "") {
      return;
    }
    const last = this.events.at(-1);
    if (last?.stream === stream) {
      last.text += text;
    } else {
      this.events.push({ stream, text });
    }
  }

  /** All text written to `stream`, in order. */
  text(stream: OutputStream): string {
    return this.events
      .filter((event) => event.stream === stream)
      .map((event) => event.text)
      .join("");
  }
}

class Runner {
  readonly events: ShellEvent[] = [];

  /**
   * The state the current command started with. After an abort it is the result of the input,
   * so the world changes of the commands that already ran in a pipeline stay.
   */
  lastState: ShellState | undefined;

  constructor(
    private readonly commands: CommandLookup,
    private readonly clock: Clock,
  ) {}

  runAndOrList(state: ShellState, list: AndOrList): ShellState {
    let current = this.runPipeline(state, list.first);
    for (const part of list.rest) {
      const succeeded = current.session.exitStatus === 0;
      if (part.operator === "&&" ? succeeded : !succeeded) {
        current = this.runPipeline(current, part.pipeline);
      }
    }
    return current;
  }

  private runPipeline(state: ShellState, pipeline: Pipeline): ShellState {
    const [only, ...more] = pipeline.commands;
    if (only !== undefined && more.length === 0) {
      return this.runCommand(state, only, undefined, this.terminal());
    }
    let world = state.world;
    let stdin: string | undefined;
    let exitStatus = 0;
    pipeline.commands.forEach((command, index) => {
      const isLast = index === pipeline.commands.length - 1;
      const buffer = new OutputBuffer();
      const output = isLast ? this.terminal() : buffer;
      // Each command of the pipeline runs in a subshell of the shell's session.
      const result = this.runCommand({ world, session: state.session }, command, stdin, output);
      world = result.world;
      exitStatus = result.session.exitStatus;
      for (const event of buffer.events) {
        if (event.stream === "stderr") {
          this.write("stderr", event.text);
        }
      }
      stdin = buffer.text("stdout");
    });
    return { world, session: { ...state.session, exitStatus } };
  }

  /** An output that writes straight to the terminal events. */
  private terminal(): Output {
    return {
      write: (stream, text) => {
        this.write(stream, text);
      },
    };
  }

  private write(stream: OutputStream, text: string): void {
    if (text === "") {
      return;
    }
    const last = this.events.at(-1);
    if (last?.kind === "output" && last.stream === stream) {
      this.events[this.events.length - 1] = { ...last, text: last.text + text };
    } else {
      this.events.push({ kind: "output", stream, text });
    }
  }

  private runCommand(
    state: ShellState,
    command: SimpleCommand,
    stdin: string | undefined,
    output: Output,
  ): ShellState {
    this.lastState = state;
    const [redirection] = command.redirections;
    if (redirection !== undefined) {
      throw new Abort("redirection", redirection.start);
    }
    const expanded = expandWords(state.world, state.session, command.words);
    if (!expanded.ok) {
      throw new Abort(expanded.error.feature, expanded.error.start);
    }
    const [name, ...args] = expanded.fields;
    if (name === undefined) {
      const session = this.assign(state.world, state.session, command.assignments);
      return { world: state.world, session: { ...session, exitStatus: 0 } };
    }
    if (name.includes("/")) {
      throw new Abort("command-path", command.words[0]?.start ?? command.start);
    }
    const commandSession = this.assign(state.world, state.session, command.assignments);
    const implementation = this.commands(name);
    if (implementation === undefined) {
      output.write("stderr", `bash: ${name}: command not found\n`);
      return withExitStatus(state, COMMAND_NOT_FOUND);
    }
    const result = implementation({
      world: state.world,
      session: commandSession,
      name,
      args,
      stdin,
      clock: this.clock,
      stdout: (text) => {
        output.write("stdout", text);
      },
      stderr: (text) => {
        output.write("stderr", text);
      },
    });
    checkExitStatus(name, result.exitStatus);
    const session = restoreVariables(
      result.session ?? commandSession,
      state.session,
      command.assignments,
    );
    return {
      world: result.world ?? state.world,
      session: { ...session, exitStatus: result.exitStatus },
    };
  }

  /** Applies `assignments` from left to right; each one sees the variables set before it. */
  private assign(world: World, session: Session, assignments: readonly Assignment[]): Session {
    let current = session;
    for (const assignment of assignments) {
      const expanded = expandAssignment(world, current, assignment);
      if (!expanded.ok) {
        throw new Abort(expanded.error.feature, expanded.error.start);
      }
      const previous = assignment.append ? (current.variables.get(assignment.name) ?? "") : "";
      current = withVariable(current, assignment.name, previous + expanded.value);
    }
    return current;
  }
}

/** Gives the variables that the assignments before a command set back their earlier values. */
function restoreVariables(
  session: Session,
  before: Session,
  assignments: readonly Assignment[],
): Session {
  let current = session;
  for (const name of new Set(assignments.map((assignment) => assignment.name))) {
    current = withVariable(current, name, before.variables.get(name));
  }
  return current;
}

function checkExitStatus(name: string, exitStatus: number): void {
  if (!Number.isInteger(exitStatus) || exitStatus < 0 || exitStatus > 255) {
    throw new RangeError(
      `command "${name}" returned the exit status ${String(exitStatus)}, not 0 to 255`,
    );
  }
}
