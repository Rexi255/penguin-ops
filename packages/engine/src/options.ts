// Option parser shared by the simulated commands (ADR 0007, ADR 0051), modelled on GNU
// `getopt_long` in glibc 2.41 (Debian 13): clusters of short options (`-la`), option arguments
// attached or in the next argument (`-n5`, `-n 5`, `--lines=5`, `--lines 5`), unambiguous
// abbreviations of long options (`--al` for `--all`), `--` as the end of the options, and
// operands between options. The messages are glibc's; the "Try ... --help" line is coreutils'.

/** Whether an option takes an argument, like `no_argument`, `required_argument` and `optional_argument`. */
export type OptionArgument = "none" | "required" | "optional";

/**
 * One option of a command: a short name (one character, `-n`), a long name (`--lines`) or both.
 * Several specs may share an `id`, for aliases such as `--color` and `--colour`.
 */
export interface OptionSpec<Id extends string = string> {
  readonly id: Id;
  /** The character after `-`, such as `n` for `-n`. */
  readonly short?: string;
  /** The name after `--`, such as `lines` for `--lines`. */
  readonly long?: string;
  readonly argument: OptionArgument;
}

/**
 * Where the options end:
 *
 * - `permute`: GNU's default; operands may stand between options (`ls docs -l`), only `--` ends
 *   the options.
 * - `require-order`: the first operand ends the options, like POSIX `getopt` and GNU commands
 *   that run another command (`env`, `nice`, `timeout`).
 */
export type OptionOrder = "permute" | "require-order";

/** An option found in the arguments. */
export interface ParsedOption<Id extends string = string> {
  readonly id: Id;
  /**
   * The option's full name with its dashes, such as `-n` or `--lines`; also when the player
   * abbreviated the long name.
   */
  readonly name: string;
  /**
   * The argument of an option that takes one. `undefined` for options without an argument and
   * for an optional argument that was left out; an empty string for `--lines=`.
   */
  readonly argument: string | undefined;
}

/** Why the arguments could not be parsed. Each kind matches one message of glibc's `getopt_long`. */
export type OptionError =
  /** A short option the command does not have: `invalid option -- 'x'`. */
  | { readonly kind: "invalid-option"; readonly option: string }
  /** A long option the command does not have: `unrecognized option '--foo=bar'`. */
  | { readonly kind: "unrecognized-option"; readonly arg: string }
  /** An abbreviation of several long options; `possibilities` are their names without `--`. */
  | {
      readonly kind: "ambiguous-option";
      readonly arg: string;
      readonly possibilities: readonly string[];
    }
  /** An option that needs an argument but has none; `name` as in `ParsedOption`. */
  | { readonly kind: "missing-argument"; readonly name: string }
  /** A long option without an argument that got one (`--all=yes`); `name` as in `ParsedOption`. */
  | { readonly kind: "unexpected-argument"; readonly name: string };

/**
 * The result of `parseOptions`: the options in the order written and the operands, or the first
 * error. A failure keeps the options before the error, because `getopt_long` returns them to the
 * command before it reports the error, and some commands act on them at once (`--help`).
 */
export type OptionParseResult<Id extends string = string> =
  | {
      readonly ok: true;
      readonly options: readonly ParsedOption<Id>[];
      readonly operands: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: OptionError;
      readonly options: readonly ParsedOption<Id>[];
    };

/** A spec with a long name, so lookups by long name need no checks. */
type LongSpec<Id extends string> = OptionSpec<Id> & { readonly long: string };

/**
 * The options of one argument and the index of the next argument to look at, or an error and
 * the options of the argument before it (`-ax` gives `-a`, then the error for `x`).
 */
type Step<Id extends string> =
  | { readonly ok: true; readonly options: readonly ParsedOption<Id>[]; readonly next: number }
  | {
      readonly ok: false;
      readonly error: OptionError;
      readonly options: readonly ParsedOption<Id>[];
    };

/**
 * Splits the arguments of a command into options and operands like `getopt_long`:
 *
 * - `--` ends the options; it is not an operand itself, everything after it is.
 * - `-` alone and every argument that does not start with `-` is an operand. With `permute`
 *   the options after it are still parsed; with `require-order` it and everything after it are
 *   operands.
 * - An argument starting with `--` is a long option. Its name may be abbreviated as long as
 *   the abbreviation is unambiguous; an exact name always wins. Several matches are not
 *   ambiguous if they all have the same `id` and argument kind as the first one.
 * - Any other argument starting with `-` is a cluster of short options (`-la` is `-l -a`).
 * - A required argument is the rest of the cluster (`-n5`) or the text after `=` (`--lines=5`),
 *   else the next argument, even if that starts with `-` (`-n -5`, `--lines --`).
 * - An optional argument must be attached (`-a5`, `--color=always`); the next argument is
 *   never taken.
 *
 * The first error ends the parsing, like in the coreutils, which exit on the first error; the
 * options before it are part of the failure. Throws an Error if `specs` are invalid (see
 * `validateOptionSpecs`).
 */
export function parseOptions<Id extends string>(
  args: readonly string[],
  specs: readonly OptionSpec<Id>[],
  order: OptionOrder = "permute",
): OptionParseResult<Id> {
  validateOptionSpecs(specs);
  const options: ParsedOption<Id>[] = [];
  const operands: string[] = [];
  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? "";
    if (arg === "--") {
      operands.push(...args.slice(index + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      if (order === "require-order") {
        operands.push(...args.slice(index));
        break;
      }
      operands.push(arg);
      index += 1;
      continue;
    }
    const step = arg.startsWith("--")
      ? parseLongOption(arg, args, index + 1, specs)
      : parseShortCluster(arg, args, index + 1, specs);
    if (!step.ok) {
      return { ok: false, error: step.error, options: [...options, ...step.options] };
    }
    options.push(...step.options);
    index = step.next;
  }
  return { ok: true, options, operands };
}

/**
 * The message glibc's `getopt_long` writes to standard error for `error`, with a newline.
 * `program` is the command name as the player wrote it.
 */
export function optionErrorMessage(program: string, error: OptionError): string {
  switch (error.kind) {
    case "invalid-option":
      return `${program}: invalid option -- '${error.option}'\n`;
    case "unrecognized-option":
      return `${program}: unrecognized option '${error.arg}'\n`;
    case "ambiguous-option": {
      const possibilities = error.possibilities.map((name) => ` '--${name}'`).join("");
      return `${program}: option '${error.arg}' is ambiguous; possibilities:${possibilities}\n`;
    }
    case "missing-argument":
      return isLongName(error.name)
        ? `${program}: option '${error.name}' requires an argument\n`
        : `${program}: option requires an argument -- '${error.name.slice(1)}'\n`;
    case "unexpected-argument":
      return `${program}: option '${error.name}' doesn't allow an argument\n`;
  }
}

/** The line the coreutils write after a usage error, with a newline. */
export function tryHelpMessage(program: string): string {
  return `Try '${program} --help' for more information.\n`;
}

/** Whether `name` (as in `ParsedOption`) is a long option name. */
function isLongName(name: string): boolean {
  return name.startsWith("--");
}

/** Parses the long option `arg` (starting with `--`); `next` is the index after it. */
function parseLongOption<Id extends string>(
  arg: string,
  args: readonly string[],
  next: number,
  specs: readonly OptionSpec<Id>[],
): Step<Id> {
  const body = arg.slice(2);
  const equals = body.indexOf("=");
  const name = equals < 0 ? body : body.slice(0, equals);
  const attached = equals < 0 ? undefined : body.slice(equals + 1);

  const match = findLongOption(name, specs);
  if (match.kind === "none") {
    return failed({ kind: "unrecognized-option", arg });
  }
  if (match.kind === "ambiguous") {
    return failed({ kind: "ambiguous-option", arg, possibilities: match.possibilities });
  }
  const spec = match.spec;
  const fullName = `--${spec.long}`;
  switch (spec.argument) {
    case "none":
      if (attached !== undefined) {
        return failed({ kind: "unexpected-argument", name: fullName });
      }
      return found(spec.id, fullName, undefined, next);
    case "optional":
      return found(spec.id, fullName, attached, next);
    case "required": {
      if (attached !== undefined) {
        return found(spec.id, fullName, attached, next);
      }
      const following = args[next];
      if (following === undefined) {
        return failed({ kind: "missing-argument", name: fullName });
      }
      return found(spec.id, fullName, following, next + 1);
    }
  }
}

/** The result of looking up a possibly abbreviated long option name. */
type LongMatch<Id extends string> =
  | { readonly kind: "found"; readonly spec: LongSpec<Id> }
  | { readonly kind: "ambiguous"; readonly possibilities: readonly string[] }
  | { readonly kind: "none" };

/**
 * Finds the long option `name` like glibc: an exact name first, else the options whose names
 * start with `name`. The first of those wins unless a later one differs from it in `id` or
 * argument kind; then the abbreviation is ambiguous, and the possibilities are the first one
 * and every later one that differs from it, in declaration order.
 */
function findLongOption<Id extends string>(
  name: string,
  specs: readonly OptionSpec<Id>[],
): LongMatch<Id> {
  const longSpecs = specs.filter(hasLongName);
  const exact = longSpecs.find((spec) => spec.long === name);
  if (exact !== undefined) {
    return { kind: "found", spec: exact };
  }
  const [first, ...others] = longSpecs.filter((spec) => spec.long.startsWith(name));
  if (first === undefined) {
    return { kind: "none" };
  }
  const differing = others.filter(
    (spec) => spec.id !== first.id || spec.argument !== first.argument,
  );
  if (differing.length === 0) {
    return { kind: "found", spec: first };
  }
  return { kind: "ambiguous", possibilities: [first, ...differing].map((spec) => spec.long) };
}

/** Parses the cluster of short options `arg` (starting with one `-`); `next` is the index after it. */
function parseShortCluster<Id extends string>(
  arg: string,
  args: readonly string[],
  next: number,
  specs: readonly OptionSpec<Id>[],
): Step<Id> {
  const characters = Array.from(arg.slice(1));
  const options: ParsedOption<Id>[] = [];
  for (const [position, character] of characters.entries()) {
    const spec = specs.find((candidate) => candidate.short === character);
    if (spec === undefined) {
      return { ok: false, error: { kind: "invalid-option", option: character }, options };
    }
    const name = `-${character}`;
    const rest = characters.slice(position + 1).join("");
    switch (spec.argument) {
      case "none":
        options.push({ id: spec.id, name, argument: undefined });
        break;
      case "optional":
        options.push({ id: spec.id, name, argument: rest === "" ? undefined : rest });
        return { ok: true, options, next };
      case "required": {
        if (rest !== "") {
          options.push({ id: spec.id, name, argument: rest });
          return { ok: true, options, next };
        }
        const following = args[next];
        if (following === undefined) {
          return { ok: false, error: { kind: "missing-argument", name }, options };
        }
        options.push({ id: spec.id, name, argument: following });
        return { ok: true, options, next: next + 1 };
      }
    }
  }
  return { ok: true, options, next };
}

/** A step that failed with `error` before it found an option. */
function failed<Id extends string>(error: OptionError): Step<Id> {
  return { ok: false, error, options: [] };
}

/** A step that found one option. */
function found<Id extends string>(
  id: Id,
  name: string,
  argument: string | undefined,
  next: number,
): Step<Id> {
  return { ok: true, options: [{ id, name, argument }], next };
}

function hasLongName<Id extends string>(spec: OptionSpec<Id>): spec is LongSpec<Id> {
  return spec.long !== undefined;
}

/**
 * Throws an Error if the option table of a command is invalid: an option with neither name, a
 * short name that is not one character or is `-`, a long name that is empty or contains `=`, or
 * a name used twice. `parseOptions` checks its specs with it; command definitions check theirs
 * when they are created.
 */
export function validateOptionSpecs(specs: readonly OptionSpec[]): void {
  const shortNames = new Set<string>();
  const longNames = new Set<string>();
  for (const spec of specs) {
    if (spec.short === undefined && spec.long === undefined) {
      throw new Error(`option "${spec.id}" has neither a short nor a long name`);
    }
    if (spec.short !== undefined) {
      if (Array.from(spec.short).length !== 1 || spec.short === "-") {
        throw new Error(`option "${spec.id}" has an invalid short name "${spec.short}"`);
      }
      if (shortNames.has(spec.short)) {
        throw new Error(`the short option "-${spec.short}" is declared twice`);
      }
      shortNames.add(spec.short);
    }
    if (spec.long !== undefined) {
      if (spec.long === "" || spec.long.includes("=")) {
        throw new Error(`option "${spec.id}" has an invalid long name "${spec.long}"`);
      }
      if (longNames.has(spec.long)) {
        throw new Error(`the long option "--${spec.long}" is declared twice`);
      }
      longNames.add(spec.long);
    }
  }
}
