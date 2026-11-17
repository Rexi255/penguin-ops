// Interpreter of the shell, execution part (ADR 0007, ADR 0047): runs the syntax tree of the
// parser like bash. And-or lists run in order, `&&` and `||` look at the exit status of the
// previous pipeline, and the commands of a pipeline run one after the other with the output of
// one as the input of the next. Assignments set shell variables or, before a command name, only
// the variables that command sees. Redirections (ADR 0049) open their files from left to right
// before the command runs; the output for a file is added to it after the command.

import type { Clock, GameClock } from "./clock";
import { expandAssignment, expandWords, type UnsupportedParameter } from "./expand";
import { openForReading, readOpenFile } from "./fs-read";
import { writeFile, type WriteError, writeToOpenFile } from "./fs-write";
import type { AndOrList, Assignment, Pipeline, Redirection, Script, SimpleCommand } from "./parser";
import type { Session } from "./session";
import type { World } from "./world";

/** The output streams of a command. */
export type OutputStream = "stdout" | "stderr";

/** The standard input of a command. */
export type StandardInput =
  /** The terminal. The game does not simulate typing into a running command. */
  | { readonly kind: "terminal" }
  /** Text from the previous command of a pipeline, or the content of a file (`< file`). */
  | { readonly kind: "text"; readonly text: string }
  /** A directory (`< /tmp`): bash opens it, but every read fails with "Is a directory". */
  | { readonly kind: "directory" };

/** What a command gets when it runs. */
export interface CommandContext {
  readonly world: World;
  /** The session with the assignments written before the command name. */
  readonly session: Session;
  /** The command name as the player wrote it (after expansion). */
  readonly name: string;
  /** The arguments after the command name (after expansion). */
  readonly args: readonly string[];
  /** Where the command reads its input from. */
  readonly stdin: StandardInput;
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
  /** A redirection of a file descriptor other than 0, 1 and 2, such as `3> file`. */
  | "file-descriptor"
  /** Output redirection of standard input (`0> file`), or input redirection of `1<` or `2<`. */
  | "reversed-redirection"
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

/** The exit status of a command whose redirection failed; the command does not run. */
const REDIRECTION_FAILED = 1;

/** The messages of the Linux error codes, as bash prints them after a failed redirection. */
const ERROR_MESSAGES: Readonly<Record<WriteError, string>> = {
  ENOENT: "No such file or directory",
  ENOTDIR: "Not a directory",
  EACCES: "Permission denied",
  EISDIR: "Is a directory",
};

/** The standard input of a command that reads from the terminal. */
const TERMINAL: StandardInput = { kind: "terminal" };

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
 * - Redirections come next, from left to right, with the variables of the assignments: `<` opens
 *   a file or directory for reading, `>` creates or empties a file, `>>` creates a file or keeps
 *   its content; `2>` and `2>>` redirect standard error. Each target must expand to exactly one
 *   field (else `bash: WORD: ambiguous redirect`). The first redirection that fails writes
 *   `bash: PATH: MESSAGE` to the standard error as redirected so far and gives exit status 1;
 *   the command does not run, but the files opened before stay. A later redirection of the same
 *   stream wins, and a redirection of standard input or output wins over the pipe.
 * - The output to a file is added to it after the command, in the order the command wrote it.
 * - An unknown command writes `bash: NAME: command not found` (after its redirections) and has
 *   exit status 127.
 *
 * Expansion errors, redirections of file descriptors other than 0, 1 and 2, reversed
 * redirections (`0>`, `1<`) and command names with a `/` stop the rest of the input with an
 * "unsupported" event and exit status 1. Throws an Error if a command returns an exit status
 * outside 0 to 255, or if the session's host is not part of the world.
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

/** The streams a redirection can connect to a file. */
type RedirectedStream = "stdin" | OutputStream;

/** A file that a redirection opened for output: its host and canonical absolute path. */
interface OpenFile {
  readonly host: string;
  readonly path: string;
}

/**
 * The result of the redirections of one command: all opened, one failed (bash's message is
 * written), or one the game does not simulate. `world` holds the files opened until then.
 */
type RedirectionResult =
  | { readonly kind: "opened" | "failed"; readonly world: World }
  | {
      readonly kind: "unsupported";
      readonly world: World;
      readonly feature: UnsupportedExecution;
      readonly start: number;
    };

/** The result of opening the target of one redirection. */
type OpenResult =
  | { readonly kind: "opened"; readonly world: World }
  | { readonly kind: "failed"; readonly error: WriteError };

/**
 * The stream that `redirection` connects: file descriptor 0 for `<`, 1 for `>` and `>>`, or the
 * one written before the operator. Other descriptors and reversed directions are unsupported.
 */
function redirectedStream(
  redirection: Redirection,
): RedirectedStream | { readonly feature: UnsupportedExecution; readonly start: number } {
  const input = redirection.operator === "<";
  const fd = redirection.fd === undefined ? (input ? 0 : 1) : Number(redirection.fd);
  const start = redirection.start;
  switch (fd) {
    case 0:
      return input ? "stdin" : { feature: "reversed-redirection", start };
    case 1:
      return input ? { feature: "reversed-redirection", start } : "stdout";
    case 2:
      return input ? { feature: "reversed-redirection", start } : "stderr";
    default:
      return { feature: "file-descriptor", start };
  }
}

/** Standard input as the redirections leave it: given, or a file that `<` opened. */
type RedirectedInput = StandardInput | ({ readonly kind: "file" } & OpenFile);

/**
 * The standard streams of one command after its redirections. A file opened with `<` is read
 * only when the command starts, so it sees what later redirections did to it (`< f > f` reads
 * the emptied file). Output to the terminal or the pipe goes on at once; output to a file is
 * kept in order and added to the files by `flush`, because the command works on its own copy of
 * the world while it runs.
 */
class CommandStreams {
  private readonly files = new Map<OutputStream, OpenFile>();
  private readonly pending: { file: OpenFile; text: string }[] = [];

  constructor(
    private input: RedirectedInput,
    private readonly output: Output,
  ) {}

  /** Reads standard input from `input` from now on. */
  readFrom(input: RedirectedInput): void {
    this.input = input;
  }

  /** Sends the output of `stream` to `file` from now on. */
  redirect(stream: OutputStream, file: OpenFile): void {
    this.files.set(stream, file);
  }

  /** The standard input for the command; a file opened with `<` is read from `world` now. */
  stdin(world: World): StandardInput {
    const input = this.input;
    switch (input.kind) {
      case "terminal":
      case "text":
      case "directory":
        return input;
      case "file":
        return { kind: "text", text: readOpenFile(world, input.host, input.path) };
    }
  }

  write(stream: OutputStream, text: string): void {
    const file = this.files.get(stream);
    if (file === undefined) {
      this.output.write(stream, text);
      return;
    }
    if (text === "") {
      return;
    }
    const last = this.pending.at(-1);
    // Two redirections to the same file (`> f 2>> f`) share one chunk while they take turns.
    if (last?.file.host === file.host && last.file.path === file.path) {
      last.text += text;
    } else {
      this.pending.push({ file, text });
    }
  }

  /** Adds the output kept for files to them in `world`, in the order it was written. */
  flush(world: World, clock: Clock): World {
    let current = world;
    for (const { file, text } of this.pending) {
      current = writeToOpenFile(current, file.host, file.path, text, clock);
    }
    this.pending.length = 0;
    return current;
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
      return this.runCommand(state, only, TERMINAL, this.terminal());
    }
    let world = state.world;
    let stdin: StandardInput = TERMINAL;
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
      stdin = { kind: "text", text: buffer.text("stdout") };
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
    stdin: StandardInput,
    output: Output,
  ): ShellState {
    this.lastState = state;
    const expanded = expandWords(state.world, state.session, command.words);
    if (!expanded.ok) {
      throw new Abort(expanded.error.feature, expanded.error.start);
    }
    const [name, ...args] = expanded.fields;
    if (name?.includes("/") === true) {
      throw new Abort("command-path", command.words[0]?.start ?? command.start);
    }
    const commandSession = this.assign(state.world, state.session, command.assignments);
    const streams = new CommandStreams(stdin, output);
    const redirected = this.redirect(state.world, commandSession, command.redirections, streams);
    const opened = redirected.world;
    if (redirected.kind === "unsupported") {
      // The files opened before the stop stay, like every other change before a stop. Without a
      // command name that includes the assignments, which are made before the redirections.
      const session = name === undefined ? commandSession : state.session;
      this.lastState = { world: opened, session };
      throw new Abort(redirected.feature, redirected.start);
    }
    if (name === undefined) {
      // Without a command name the assignments stay, even after a failed redirection.
      const exitStatus = redirected.kind === "opened" ? 0 : REDIRECTION_FAILED;
      const world = streams.flush(opened, this.clock);
      return { world, session: { ...commandSession, exitStatus } };
    }
    if (redirected.kind === "failed") {
      const world = streams.flush(opened, this.clock);
      return withExitStatus({ world, session: state.session }, REDIRECTION_FAILED);
    }
    const implementation = this.commands(name);
    if (implementation === undefined) {
      streams.write("stderr", `bash: ${name}: command not found\n`);
      const world = streams.flush(opened, this.clock);
      return withExitStatus({ world, session: state.session }, COMMAND_NOT_FOUND);
    }
    const result = implementation({
      world: opened,
      session: commandSession,
      name,
      args,
      stdin: streams.stdin(opened),
      clock: this.clock,
      stdout: (text) => {
        streams.write("stdout", text);
      },
      stderr: (text) => {
        streams.write("stderr", text);
      },
    });
    checkExitStatus(name, result.exitStatus);
    const session = restoreVariables(
      result.session ?? commandSession,
      state.session,
      command.assignments,
    );
    return {
      world: streams.flush(result.world ?? opened, this.clock),
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

  /**
   * Performs `redirections` from left to right for a command with `session`. Stops at the first
   * redirection that fails, after writing bash's message to the standard error as redirected so
   * far, or at the first one the game does not simulate.
   */
  private redirect(
    world: World,
    session: Session,
    redirections: readonly Redirection[],
    streams: CommandStreams,
  ): RedirectionResult {
    let current = world;
    for (const redirection of redirections) {
      const stream = redirectedStream(redirection);
      if (typeof stream !== "string") {
        return { kind: "unsupported", world: current, ...stream };
      }
      const target = expandWords(current, session, [redirection.target]);
      if (!target.ok) {
        const { feature, start } = target.error;
        return { kind: "unsupported", world: current, feature, start };
      }
      const [path, ...more] = target.fields;
      if (path === undefined || more.length > 0) {
        streams.write("stderr", `bash: ${redirection.target.raw}: ambiguous redirect\n`);
        return { kind: "failed", world: current };
      }
      const opened = this.open(current, session, path, stream, redirection, streams);
      if (opened.kind === "failed") {
        streams.write("stderr", `bash: ${path}: ${ERROR_MESSAGES[opened.error]}\n`);
        return { kind: "failed", world: current };
      }
      current = opened.world;
    }
    return { kind: "opened", world: current };
  }

  /** Opens `path` for one redirection and connects it to `stream`. */
  private open(
    world: World,
    session: Session,
    path: string,
    stream: RedirectedStream,
    redirection: Redirection,
    streams: CommandStreams,
  ): OpenResult {
    if (stream === "stdin") {
      const read = openForReading(world, session, path);
      if (!read.ok) {
        return { kind: "failed", error: read.error };
      }
      const opened = read.opened;
      streams.readFrom(
        opened.kind === "file" ? { kind: "file", host: session.host, path: opened.path } : opened,
      );
      return { kind: "opened", world };
    }
    const mode = redirection.operator === ">>" ? "append" : "truncate";
    const written = writeFile(world, session, { path, text: "", mode }, this.clock);
    if (!written.ok) {
      return { kind: "failed", error: written.error };
    }
    streams.redirect(stream, { host: session.host, path: written.path });
    return { kind: "opened", world: written.world };
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
