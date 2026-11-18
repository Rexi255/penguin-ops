// Command registry (ADR 0007, ADR 0052): commands declare the complete option table of the real
// command and which of its options the game simulates. `defineCommand` parses the arguments with
// the shared option parser (ADR 0051) before the command runs: an option the game does not
// simulate stops the input with a game notice, an invalid option gives the coreutils' usage
// error, and the command itself only sees valid, simulated options. `createCommandLookup` turns
// the registered commands into the `CommandLookup` of the interpreter.

import type { CommandContext, CommandLookup, CommandResult, ShellCommand } from "./interpreter";
import {
  optionErrorMessage,
  type OptionOrder,
  type OptionSpec,
  type ParsedOption,
  parseOptions,
  tryHelpMessage,
  validateOptionSpecs,
} from "./options";

/** What a command with an option table gets when it runs: its context and its parsed arguments. */
export interface CommandInvocation<Id extends string = string> extends CommandContext {
  /** The options in the order written; all of them are simulated. */
  readonly options: readonly ParsedOption<Id>[];
  /** The arguments that are not options, in order. */
  readonly operands: readonly string[];
}

/** A command that reads its options like GNU `getopt_long`, as most coreutils do. */
export interface CommandDefinition<Id extends string = string> {
  /** The name the player types, such as `ls`. */
  readonly name: string;
  /**
   * The complete option table of the real command on Debian 13, in the order of its
   * `long_options` array, also with the options the game does not simulate (ADR 0051).
   */
  readonly options: readonly OptionSpec<Id>[];
  /** The ids of the options the game simulates. Every other option stops the input. */
  readonly simulated: readonly Id[];
  /** Where the options end; `permute` by default, like GNU. */
  readonly order?: OptionOrder;
  /** The exit status after a usage error: 2 for `ls` and `grep`, 1 for most other coreutils. */
  readonly usageErrorStatus: number;
  /**
   * Reads an obsolete option syntax that the real command handles before `getopt_long`, such as
   * `head -5` or `tail +5`. Returns `undefined` if the arguments do not have that form; else the
   * options it stands for, which come before all other options, and the arguments left for the
   * option parser, or the error after which the command exits.
   */
  readonly obsoleteSyntax?: (args: readonly string[]) => ObsoleteOptions<Id> | undefined;
  /**
   * Checks one option as the real command does while it reads its options, such as the number
   * of `head -n abc`. Returns `undefined` if the option is valid, else the error after which the
   * command exits. It sees the simulated options in the order written, and an error here comes
   * before an error of a later argument.
   */
  readonly checkOption?: (option: ParsedOption<Id>) => OptionFailure | undefined;
  /**
   * Lines that the real command writes after glibc's message for an invalid option and before
   * the "Try ... --help" line, such as `rm`'s hint for a file name that starts with `-`.
   */
  readonly usageErrorNote?: (context: CommandContext) => string;
  /** Runs the command with valid, simulated options. */
  readonly run: (invocation: CommandInvocation<Id>) => CommandResult;
}

/**
 * An error in the options after which the real command exits with its usage error status:
 * `message` (without the command name) and, if `tryHelp` is true, the "Try ... --help" line.
 */
export interface OptionFailure {
  readonly message: string;
  readonly tryHelp: boolean;
}

/** The result of `obsoleteSyntax`: the options and the arguments left, or an error. */
export type ObsoleteOptions<Id extends string> =
  | {
      readonly ok: true;
      readonly options: readonly ParsedOption<Id>[];
      readonly args: readonly string[];
    }
  | { readonly ok: false; readonly failure: OptionFailure };

/** A command for the registry: its name and the function the interpreter calls. */
export interface RegisteredCommand {
  readonly name: string;
  readonly run: ShellCommand;
}

/**
 * Builds the command of `definition`. When it runs, it reads an obsolete option syntax first if
 * the definition has one (an error there writes `NAME: MESSAGE` and maybe the "Try ... --help"
 * line and returns `usageErrorStatus`), parses the other arguments with `parseOptions` and then
 * goes through the options before the first error in order:
 *
 * - An option the game does not simulate returns a stop with the notice `option-not-simulated`.
 *   The real command might act on that option at once (`--help` exits before later errors), so
 *   the game cannot know what it would print.
 * - An option that `checkOption` rejects writes its error like an obsolete option and returns
 *   `usageErrorStatus`.
 *
 * Then, if the arguments have an error, it writes glibc's message, the `usageErrorNote` if the
 * definition has one, and the coreutils' "Try ... --help" line to standard error and returns
 * `usageErrorStatus`. Else it runs the
 * command with the options (the obsolete ones first) and operands.
 *
 * Messages name the command as the player wrote it. Throws an Error if the definition is
 * invalid: an empty name or one with `/`, an invalid option table (see `validateOptionSpecs`), a
 * simulated id that is not in the table, or a usage error status outside 1 to 255.
 */
export function defineCommand<Id extends string>(
  definition: CommandDefinition<Id>,
): RegisteredCommand {
  const {
    name,
    options: specs,
    order = "permute",
    usageErrorStatus,
    obsoleteSyntax,
    checkOption,
    usageErrorNote,
    run,
  } = definition;
  validateName(name);
  validateOptionSpecs(specs);
  const simulated = new Set<Id>(definition.simulated);
  for (const id of simulated) {
    if (!specs.some((spec) => spec.id === id)) {
      throw new Error(`command "${name}" simulates the option "${id}", which is not in its table`);
    }
  }
  if (!Number.isInteger(usageErrorStatus) || usageErrorStatus < 1 || usageErrorStatus > 255) {
    throw new RangeError(
      `command "${name}" has the usage error status ${String(usageErrorStatus)}, not 1 to 255`,
    );
  }
  return {
    name,
    run: (context) => {
      const fail = (failure: OptionFailure): CommandResult => {
        const tryHelp = failure.tryHelp ? tryHelpMessage(context.name) : "";
        context.stderr(`${context.name}: ${failure.message}\n${tryHelp}`);
        return { exitStatus: usageErrorStatus };
      };
      const obsolete = obsoleteSyntax?.(context.args);
      if (obsolete?.ok === false) {
        return fail(obsolete.failure);
      }
      const parsed = parseOptions(obsolete?.args ?? context.args, specs, order);
      const options = [...(obsolete?.options ?? []), ...parsed.options];
      for (const option of options) {
        if (!simulated.has(option.id)) {
          return { stop: { key: "option-not-simulated", option: option.name } };
        }
        const failure = checkOption?.(option);
        if (failure !== undefined) {
          return fail(failure);
        }
      }
      if (!parsed.ok) {
        const note = usageErrorNote?.(context) ?? "";
        context.stderr(
          optionErrorMessage(context.name, parsed.error) + note + tryHelpMessage(context.name),
        );
        return { exitStatus: usageErrorStatus };
      }
      return run({ ...context, options, operands: parsed.operands });
    },
  };
}

/**
 * The `CommandLookup` for `commands`: it finds a command by its exact name. Throws an Error if a
 * name is empty, contains `/` (the interpreter never looks such names up) or is used twice.
 */
export function createCommandLookup(commands: readonly RegisteredCommand[]): CommandLookup {
  const byName = new Map<string, ShellCommand>();
  for (const command of commands) {
    validateName(command.name);
    if (byName.has(command.name)) {
      throw new Error(`the command "${command.name}" is registered twice`);
    }
    byName.set(command.name, command.run);
  }
  return (name) => byName.get(name);
}

function validateName(name: string): void {
  if (name === "" || name.includes("/")) {
    throw new Error(`"${name}" is not a valid command name`);
  }
}
