// Bash builtins (ADR 0053): commands that bash runs itself, such as `cd` and `pwd`. They do not
// read their options with glibc's `getopt_long` but with bash's own `internal_getopt`, and their
// messages start with `bash: NAME: `. `defineBuiltin` parses the options like bash 5.2 before
// the builtin runs: an invalid option or a missing option argument gives bash's message and the
// builtin's usage line with exit status 2, and `--help` or an option the game does not simulate
// stops the input with a game notice (ADR 0052). Options may take an argument (ADR 0057).

import type { RegisteredCommand } from "./command-registry";
import type { CommandContext, CommandResult } from "./interpreter";

/** The exit status of a builtin after a usage error, bash's `EX_USAGE`. */
export const BUILTIN_USAGE_STATUS = 2;

/** The result of `parseBuiltinOptions`. */
export type BuiltinOptionParse =
  /**
   * The options in the order written (one letter each), the argument of the last occurrence of
   * each option that takes one, and the operands after the options.
   */
  | {
      readonly kind: "parsed";
      readonly options: readonly string[];
      readonly optionArguments: ReadonlyMap<string, string>;
      readonly operands: readonly string[];
    }
  /** The word `--help` in place of an option; bash prints the builtin's help. */
  | { readonly kind: "help"; readonly options: readonly string[] }
  /** An option the builtin does not have, with its dash, such as `-x`. */
  | { readonly kind: "invalid"; readonly option: string; readonly options: readonly string[] }
  /** An option that takes an argument, with its dash, as the last word. */
  | {
      readonly kind: "missing-argument";
      readonly option: string;
      readonly options: readonly string[];
    };

/**
 * Splits `args` into options and operands like bash 5.2's `internal_getopt`. `letters` are the
 * option letters of the builtin, and `withArgument` those of them that take an argument (`d:`
 * in bash's option string).
 *
 * - The options end at the first word that does not start with `-`, at a lone `-` (an operand)
 *   and after `--`.
 * - A word may hold several options (`-LP`).
 * - An option that takes an argument takes the rest of its word (`-d5`), or else the next word,
 *   whatever it looks like (`-d -1`). Without a next word it gives `missing-argument`.
 * - The word `--help` gives `help`. Every other word starting with `--` is the invalid option
 *   `-` (`bash: cd: --: invalid option`).
 * - The first letter that is not in `letters` gives `invalid`; the options before it are kept,
 *   because bash acts on them before it reports the error.
 */
export function parseBuiltinOptions(
  args: readonly string[],
  letters: readonly string[],
  withArgument: readonly string[] = [],
): BuiltinOptionParse {
  const options: string[] = [];
  const optionArguments = new Map<string, string>();
  let index = 0;
  for (; index < args.length; index++) {
    const word = args[index] ?? "";
    if (!word.startsWith("-") || word === "-") {
      break;
    }
    if (word === "--help") {
      return { kind: "help", options };
    }
    if (word === "--") {
      index++;
      break;
    }
    const characters = Array.from(word.slice(1));
    for (const [position, letter] of characters.entries()) {
      if (!letters.includes(letter)) {
        return { kind: "invalid", option: `-${letter}`, options };
      }
      options.push(letter);
      if (!withArgument.includes(letter)) {
        continue;
      }
      const rest = characters.slice(position + 1).join("");
      if (rest !== "") {
        optionArguments.set(letter, rest);
        break;
      }
      const next = args[index + 1];
      if (next === undefined) {
        return { kind: "missing-argument", option: `-${letter}`, options };
      }
      optionArguments.set(letter, next);
      index++;
      break;
    }
  }
  return { kind: "parsed", options, optionArguments, operands: args.slice(index) };
}

/** What a builtin gets when it runs: its context and its parsed arguments. */
export interface BuiltinInvocation extends CommandContext {
  /** The option letters in the order written; all of them are simulated. */
  readonly options: readonly string[];
  /** The argument of the last occurrence of each option that takes one, by its letter. */
  readonly optionArguments: ReadonlyMap<string, string>;
  /** The arguments after the options, in order. */
  readonly operands: readonly string[];
}

/** A bash builtin, such as `cd` or `pwd`. */
export interface BuiltinDefinition {
  readonly name: string;
  /** All option letters of the builtin in bash 5.2 on Linux, such as `["L", "P"]` for `pwd`. */
  readonly options: readonly string[];
  /** The option letters that take an argument, such as `["d"]` for `history`; none if missing. */
  readonly withArgument?: readonly string[];
  /** The option letters the game simulates. Every other option stops the input. */
  readonly simulated: readonly string[];
  /** The builtin's synopsis from `help`, such as `pwd [-LP]`; bash prints it after usage errors. */
  readonly usage: string;
  /** Runs the builtin with valid, simulated options. */
  readonly run: (invocation: BuiltinInvocation) => CommandResult;
}

/**
 * Builds the command of the builtin `definition`. When it runs, it parses its arguments with
 * `parseBuiltinOptions` and then:
 *
 * - If an option the game does not simulate, or `--help`, comes before the first invalid option
 *   (or there is none), it returns a stop with the notice `option-not-simulated`.
 * - Else, after an invalid option, it writes `bash: NAME: -x: invalid option` and
 *   `NAME: usage: SYNOPSIS` to standard error and returns exit status 2. A missing option
 *   argument does the same with `bash: NAME: -d: option requires an argument`.
 * - Else it runs the builtin with the options and operands.
 *
 * Throws an Error if the definition is invalid: an empty name or one with `/`, an option that is
 * not a single character or is `-`, an option listed twice, or a simulated option or an option
 * with an argument that is not one of the builtin's options.
 */
export function defineBuiltin(definition: BuiltinDefinition): RegisteredCommand {
  const { name, options: letters, usage, run } = definition;
  if (name === "" || name.includes("/")) {
    throw new Error(`"${name}" is not a valid command name`);
  }
  for (const [index, letter] of letters.entries()) {
    if (Array.from(letter).length !== 1 || letter === "-") {
      throw new Error(`builtin "${name}" has the invalid option letter "${letter}"`);
    }
    if (letters.indexOf(letter) !== index) {
      throw new Error(`builtin "${name}" has the option "-${letter}" twice`);
    }
  }
  const simulated = new Set(definition.simulated);
  for (const letter of simulated) {
    if (!letters.includes(letter)) {
      throw new Error(`builtin "${name}" simulates "-${letter}", which is not one of its options`);
    }
  }
  const withArgument = definition.withArgument ?? [];
  for (const letter of withArgument) {
    if (!letters.includes(letter)) {
      throw new Error(
        `builtin "${name}" gives "-${letter}" an argument, but it is not one of its options`,
      );
    }
  }
  const usageError = (context: CommandContext, message: string): CommandResult => {
    context.stderr(builtinError(context.name, message) + `${context.name}: usage: ${usage}\n`);
    return { exitStatus: BUILTIN_USAGE_STATUS };
  };
  return {
    name,
    run: (context) => {
      const parsed = parseBuiltinOptions(context.args, letters, withArgument);
      const unsimulated = parsed.options.find((letter) => !simulated.has(letter));
      if (unsimulated !== undefined) {
        return { stop: { key: "option-not-simulated", option: `-${unsimulated}` } };
      }
      switch (parsed.kind) {
        case "help":
          return { stop: { key: "option-not-simulated", option: "--help" } };
        case "invalid":
          return usageError(context, `${parsed.option}: invalid option`);
        case "missing-argument":
          return usageError(context, `${parsed.option}: option requires an argument`);
        case "parsed":
          return run({
            ...context,
            options: parsed.options,
            optionArguments: parsed.optionArguments,
            operands: parsed.operands,
          });
      }
    },
  };
}

/** A message of the builtin `name` as an interactive bash writes it, with a newline. */
export function builtinError(name: string, message: string): string {
  return `bash: ${name}: ${message}\n`;
}
