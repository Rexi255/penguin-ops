// Parser of the shell (ADR 0007, ADR 0045): turns the tokens of the lexer into a syntax tree of
// lists, pipelines and simple commands like bash. It finds assignments and the tildes in them,
// reports bash's syntax errors as values and rejects bash syntax that the game does not simulate
// yet with an "unsupported" error, so that nothing pretends to work.

import {
  lex,
  type MissingInput,
  type RedirectionOperator,
  type RedirectionToken,
  type Token,
  type UnsupportedFeature,
  type WordPart,
  type WordToken,
} from "./lexer";

/** A word of a command with its parts and where it was found in the input (`end` exclusive). */
export interface Word {
  readonly parts: readonly WordPart[];
  readonly start: number;
  readonly end: number;
  readonly raw: string;
}

/**
 * A variable assignment before the command name: `name=value`, or `name+=value` (`append`).
 * `value` holds the parts after the `=`; tildes after the `=` and after each unquoted `:` are
 * tilde parts. An empty `value` is the empty string.
 */
export interface Assignment {
  readonly name: string;
  readonly append: boolean;
  readonly value: readonly WordPart[];
  readonly start: number;
  readonly end: number;
  readonly raw: string;
}

/** The redirection operators the game simulates. */
export type SupportedRedirectionOperator = "<" | ">" | ">>";

/**
 * A redirection such as `> out.txt` or `2>> errors.log`. `fd` holds the digits before the
 * operator as written, or `undefined` for the default (0 for `<`, 1 for `>` and `>>`); the
 * interpreter checks the range. `start` is the start of the operator, `end` the end of the target.
 */
export interface Redirection {
  readonly operator: SupportedRedirectionOperator;
  readonly fd: string | undefined;
  readonly target: Word;
  readonly start: number;
  readonly end: number;
}

/**
 * A simple command: assignments, then words (the command name and its arguments), and
 * redirections in the order they were written. Each list may be empty, but not all three.
 * Arguments and redirection targets that look like assignments (`a=~/x`) get tilde parts like
 * assignments.
 */
export interface SimpleCommand {
  readonly kind: "simple";
  readonly assignments: readonly Assignment[];
  readonly words: readonly Word[];
  readonly redirections: readonly Redirection[];
  readonly start: number;
  readonly end: number;
}

/** A command of a pipeline. Compound commands (`if`, `for`, …) will extend this union. */
export type Command = SimpleCommand;

/** Commands connected with `|`; one command is a pipeline of length one. */
export interface Pipeline {
  readonly commands: readonly Command[];
  readonly start: number;
  readonly end: number;
}

/** The operators that connect pipelines by the exit code of the previous one. */
export type AndOrOperator = "&&" | "||";

/** A pipeline that runs after `&&` or `||`. */
export interface AndOrPart {
  readonly operator: AndOrOperator;
  readonly pipeline: Pipeline;
}

/** Pipelines connected with `&&` and `||`, which bash evaluates from left to right. */
export interface AndOrList {
  readonly first: Pipeline;
  readonly rest: readonly AndOrPart[];
  readonly start: number;
  readonly end: number;
}

/** The whole input: and-or lists separated by `;` or line breaks, in order. May be empty. */
export interface Script {
  readonly lists: readonly AndOrList[];
}

/**
 * What the input still needs: what the lexer reports, or a `command` after `|`, `&&` or `||` at
 * the end of the input. An interactive shell asks for the next line; at the end of a script bash
 * reports "syntax error: unexpected end of file".
 */
export type ParseMissingInput = MissingInput | "command";

/** Bash syntax that the game does not simulate yet. The UI explains it with a game notice. */
export type UnsupportedSyntax =
  | "background-job"
  | "subshell"
  | "arithmetic-command"
  | "stderr-pipe"
  | "here-document"
  | "here-string"
  | "fd-duplication"
  | "output-and-error-redirection"
  | "read-write-redirection"
  | "clobber-redirection"
  | "pipeline-negation"
  | "time-keyword"
  | "if-clause"
  | "while-loop"
  | "until-loop"
  | "for-loop"
  | "select-loop"
  | "case-clause"
  | "command-group"
  | "conditional-command"
  | "function-definition"
  | "coprocess"
  | "array";

/**
 * Why the input could not be parsed. `start` is the offset where the problem begins.
 *
 * - `incomplete`: the input ends too early; see `ParseMissingInput`.
 * - `unsupported`: a feature of the lexer or bash syntax that the game does not simulate yet.
 * - `syntax`: bash's "syntax error near unexpected token `near'"; `near` is the token as bash
 *   names it (`newline` for a line break or the end of the input).
 */
export type ParseError =
  | { readonly kind: "incomplete"; readonly missing: ParseMissingInput; readonly start: number }
  | {
      readonly kind: "unsupported";
      readonly feature: UnsupportedFeature | UnsupportedSyntax;
      readonly start: number;
    }
  | { readonly kind: "syntax"; readonly near: string; readonly start: number };

/** The result of `parse`: the syntax tree of the input, or the first error. */
export type ParseResult =
  | { readonly ok: true; readonly script: Script }
  | { readonly ok: false; readonly error: ParseError };

/** Reserved words that start bash syntax the game does not simulate yet. */
const UNSUPPORTED_RESERVED_WORDS: ReadonlyMap<string, UnsupportedSyntax> = new Map([
  ["if", "if-clause"],
  ["while", "while-loop"],
  ["until", "until-loop"],
  ["for", "for-loop"],
  ["select", "select-loop"],
  ["case", "case-clause"],
  ["function", "function-definition"],
  ["{", "command-group"],
  ["[[", "conditional-command"],
  ["coproc", "coprocess"],
]);

/** Reserved words that bash never accepts at the start of a command outside compound commands. */
const MISPLACED_RESERVED_WORDS = new Set([
  "then",
  "else",
  "elif",
  "fi",
  "do",
  "done",
  "esac",
  "in",
  "}",
  "]]",
]);

const ASSIGNMENT_START = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=/;
const ARRAY_ELEMENT_START = /^[A-Za-z_][A-Za-z0-9_]*\[/;

/** Carries a parse error from deep inside the parser to `parse`, which returns it as a value. */
class ParseFailure extends Error {
  constructor(readonly error: ParseError) {
    super(`parse error: ${error.kind}`);
  }
}

/**
 * Parses `input` like bash into lists of and-or lists of pipelines of simple commands:
 *
 * - `;` and line breaks separate lists; empty lines and a trailing `;` are allowed;
 * - `&&` and `||` connect pipelines, `|` connects commands; line breaks may follow all three;
 * - words of the form `name=value` or `name+=value` before the command name are assignments;
 * - `<`, `>` and `>>` (with an optional file descriptor such as `2>`) need a word as target.
 *
 * Lexer errors are returned unchanged. `|`, `&&` or `||` at the end of the input give an
 * "incomplete" error. Misplaced operators and reserved words give bash's syntax error. Background
 * jobs, subshells, `|&`, here-documents, other redirection operators, `!`, `time`, compound
 * commands, function definitions and arrays give an "unsupported" error.
 */
export function parse(input: string): ParseResult {
  const lexed = lex(input);
  if (!lexed.ok) {
    return { ok: false, error: lexed.error };
  }
  try {
    return { ok: true, script: new Parser(lexed.tokens, input.length).run() };
  } catch (failure) {
    if (failure instanceof ParseFailure) {
      return { ok: false, error: failure.error };
    }
    throw failure;
  }
}

/** How bash names a token in "syntax error near unexpected token". */
function nearText(token: Token): string {
  switch (token.kind) {
    case "word":
      return token.raw;
    case "control":
      return token.operator;
    case "redirection":
      return token.fd ?? token.operator;
    case "newline":
      return "newline";
  }
}

/** Whether the game simulates a redirection operator, and which feature it is if not. */
type RedirectionSupport =
  | { readonly supported: true; readonly operator: SupportedRedirectionOperator }
  | { readonly supported: false; readonly feature: UnsupportedSyntax };

function redirectionSupport(operator: RedirectionOperator): RedirectionSupport {
  const unsupported = (feature: UnsupportedSyntax): RedirectionSupport => ({
    supported: false,
    feature,
  });
  switch (operator) {
    case "<":
    case ">":
    case ">>":
      return { supported: true, operator };
    case "<<":
    case "<<-":
      return unsupported("here-document");
    case "<<<":
      return unsupported("here-string");
    case "<&":
    case ">&":
      return unsupported("fd-duplication");
    case "&>":
    case "&>>":
      return unsupported("output-and-error-redirection");
    case "<>":
      return unsupported("read-write-redirection");
    case ">|":
      return unsupported("clobber-redirection");
  }
}

/** The parts of a word of the form `name=value` or `name+=value`, if it has that form. */
interface AssignmentShape {
  readonly name: string;
  readonly append: boolean;
  /** `name=` or `name+=`. */
  readonly lead: string;
  readonly value: readonly WordPart[];
}

/** Bash takes a word as an assignment if it starts with an unquoted `name=` or `name+=`. */
function assignmentShape(word: WordToken): AssignmentShape | undefined {
  const [first, ...rest] = word.parts;
  if (first?.kind !== "text" || first.quoted) {
    return undefined;
  }
  const match = ASSIGNMENT_START.exec(first.text);
  if (match === null) {
    return undefined;
  }
  const [lead, name = "", plus = ""] = match;
  const remainder = first.text.slice(lead.length);
  const value: WordPart[] =
    remainder === "" ? rest : [{ kind: "text", text: remainder, quoted: false }, ...rest];
  return { name, append: plus === "+", lead, value };
}

/**
 * Finds the tilde prefixes of an assignment value like bash: a `~` at the start of the value or
 * after an unquoted `:` starts a prefix that ends before the next `/` or `:`. It is a tilde part
 * only if it is unquoted text without `!`, so `~"/x"` and `~$USER` stay literal. `lead` is
 * unquoted text that comes before the value in the result (`name=` for argument words).
 */
function withTildePrefixes(lead: string, value: readonly WordPart[]): WordPart[] {
  const result: WordPart[] = [];
  let pending = lead;
  let atPrefixStart = true;
  const flush = (): void => {
    if (pending !== "") {
      result.push({ kind: "text", text: pending, quoted: false });
      pending = "";
    }
  };
  value.forEach((part, index) => {
    if (part.kind !== "text" || part.quoted) {
      flush();
      result.push(part);
      atPrefixStart = false;
      return;
    }
    const text = part.text;
    const isLastPart = index === value.length - 1;
    let position = 0;
    while (position < text.length) {
      const c = text.charAt(position);
      if (atPrefixStart && c === "~") {
        const end = prefixEnd(text, position + 1);
        const user = text.slice(position + 1, end);
        if ((end < text.length || isLastPart) && !user.includes("!")) {
          flush();
          result.push({ kind: "tilde", user });
          position = end;
          atPrefixStart = false;
          continue;
        }
      }
      pending += c;
      atPrefixStart = c === ":";
      position += 1;
    }
  });
  flush();
  return result;
}

/** The offset of the first `/` or `:` at or after `from`, or the length of `text`. */
function prefixEnd(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    const c = text.charAt(index);
    if (c === "/" || c === ":") {
      return index;
    }
  }
  return text.length;
}

function toWord(token: WordToken, parts: readonly WordPart[] = token.parts): Word {
  return { parts, start: token.start, end: token.end, raw: token.raw };
}

/**
 * An argument or redirection target. Bash finds tildes in words that look like assignments
 * (`a=~/x`) there as well, although they are not assignments.
 */
function toArgumentWord(token: WordToken): Word {
  const shape = assignmentShape(token);
  return toWord(
    token,
    shape === undefined ? token.parts : withTildePrefixes(shape.lead, shape.value),
  );
}

/** The parts of a simple command while it is being read. */
interface OpenCommand {
  readonly start: number;
  readonly assignments: Assignment[];
  readonly words: Word[];
  readonly redirections: Redirection[];
}

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly inputLength: number,
  ) {}

  run(): Script {
    const lists: AndOrList[] = [];
    this.skipNewlines();
    let next = this.peek();
    while (next !== undefined) {
      lists.push(this.parseAndOrList(next));
      const token = this.peek();
      if (token === undefined) {
        break;
      }
      if (token.kind === "newline" || (token.kind === "control" && token.operator === ";")) {
        this.position += 1;
        this.skipNewlines();
        next = this.peek();
      } else if (token.kind === "control" && token.operator === "&") {
        this.fail({ kind: "unsupported", feature: "background-job", start: token.start });
      } else {
        this.failNear(token);
      }
    }
    return { lists };
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.position + offset];
  }

  private fail(error: ParseError): never {
    throw new ParseFailure(error);
  }

  private failNear(token: Token): never {
    this.fail({ kind: "syntax", near: nearText(token), start: token.start });
  }

  private skipNewlines(): void {
    while (this.peek()?.kind === "newline") {
      this.position += 1;
    }
  }

  /** Skips line breaks after `|`, `&&` or `||` and returns the token that starts the command. */
  private expectCommandAfter(operatorStart: number): Token {
    this.skipNewlines();
    const token = this.peek();
    if (token === undefined) {
      this.fail({ kind: "incomplete", missing: "command", start: operatorStart });
    }
    return token;
  }

  private parseAndOrList(startToken: Token): AndOrList {
    const first = this.parsePipeline(startToken);
    const rest: AndOrPart[] = [];
    for (;;) {
      const token = this.peek();
      if (token?.kind !== "control" || (token.operator !== "&&" && token.operator !== "||")) {
        break;
      }
      this.position += 1;
      const next = this.expectCommandAfter(token.start);
      rest.push({ operator: token.operator, pipeline: this.parsePipeline(next) });
    }
    const last = rest.at(-1)?.pipeline ?? first;
    return { first, rest, start: first.start, end: last.end };
  }

  private parsePipeline(startToken: Token): Pipeline {
    const first = this.parseCommand(startToken, true);
    const commands: Command[] = [first];
    let last = first;
    for (;;) {
      const token = this.peek();
      if (token?.kind !== "control") {
        break;
      }
      if (token.operator === "|&") {
        this.fail({ kind: "unsupported", feature: "stderr-pipe", start: token.start });
      }
      if (token.operator !== "|") {
        break;
      }
      this.position += 1;
      last = this.parseCommand(this.expectCommandAfter(token.start), false);
      commands.push(last);
    }
    return { commands, start: first.start, end: last.end };
  }

  /** Reads the command that starts with `token`, the current token. */
  private parseCommand(token: Token, atPipelineStart: boolean): Command {
    if (token.kind === "control" && token.operator === "(") {
      const next = this.peek(1);
      const arithmetic =
        next?.kind === "control" && next.operator === "(" && next.start === token.end;
      this.fail({
        kind: "unsupported",
        feature: arithmetic ? "arithmetic-command" : "subshell",
        start: token.start,
      });
    }
    if (token.kind === "control" || token.kind === "newline") {
      this.failNear(token);
    }
    if (token.kind === "word") {
      this.checkReservedWord(token, atPipelineStart);
    }
    return this.parseSimpleCommand(token.start);
  }

  /** Rejects reserved words at the start of a command, as far as the game does not simulate them. */
  private checkReservedWord(token: WordToken, atPipelineStart: boolean): void {
    const unsupported = UNSUPPORTED_RESERVED_WORDS.get(token.raw);
    if (unsupported !== undefined) {
      this.fail({ kind: "unsupported", feature: unsupported, start: token.start });
    }
    if (MISPLACED_RESERVED_WORDS.has(token.raw)) {
      this.failNear(token);
    }
    if (token.raw === "!") {
      if (atPipelineStart) {
        this.fail({ kind: "unsupported", feature: "pipeline-negation", start: token.start });
      }
      this.failNear(token);
    }
    if (token.raw === "time" && atPipelineStart) {
      this.fail({ kind: "unsupported", feature: "time-keyword", start: token.start });
    }
  }

  private parseSimpleCommand(start: number): SimpleCommand {
    const command: OpenCommand = { start, assignments: [], words: [], redirections: [] };
    let end = start;
    for (;;) {
      const token = this.peek();
      if (token === undefined || token.kind === "newline") {
        break;
      }
      if (token.kind === "control") {
        if (token.operator === "(") {
          this.failOpenParenthesis(command, token.start);
        }
        break;
      }
      if (token.kind === "redirection") {
        const redirection = this.parseRedirection(token);
        command.redirections.push(redirection);
        end = redirection.end;
      } else {
        this.position += 1;
        this.addWord(command, token);
        end = token.end;
      }
    }
    return {
      kind: "simple",
      assignments: command.assignments,
      words: command.words,
      redirections: command.redirections,
      start,
      end,
    };
  }

  /** Adds a word as an assignment while no command name was read, otherwise as an argument. */
  private addWord(command: OpenCommand, token: WordToken): void {
    if (command.words.length > 0) {
      command.words.push(toArgumentWord(token));
      return;
    }
    const shape = assignmentShape(token);
    if (shape === undefined) {
      this.checkArrayElementAssignment(token);
      command.words.push(toWord(token));
      return;
    }
    const next = this.peek();
    if (
      shape.value.length === 0 &&
      next?.kind === "control" &&
      next.operator === "(" &&
      next.start === token.end
    ) {
      this.fail({ kind: "unsupported", feature: "array", start: token.start });
    }
    command.assignments.push({
      name: shape.name,
      append: shape.append,
      value: withTildePrefixes("", shape.value),
      start: token.start,
      end: token.end,
      raw: token.raw,
    });
  }

  /** Bash assigns `name[subscript]=value` (or `+=`) to an array element before the command name. */
  private checkArrayElementAssignment(token: WordToken): void {
    const [first] = token.parts;
    if (
      first?.kind === "text" &&
      !first.quoted &&
      ARRAY_ELEMENT_START.test(first.text) &&
      (token.raw.includes("]=") || token.raw.includes("]+="))
    ) {
      this.fail({ kind: "unsupported", feature: "array", start: token.start });
    }
  }

  /** `(` inside a command: `name ()` defines a function in bash, anything else is an error. */
  private failOpenParenthesis(command: OpenCommand, start: number): never {
    if (
      command.words.length === 1 &&
      command.assignments.length === 0 &&
      command.redirections.length === 0
    ) {
      this.fail({ kind: "unsupported", feature: "function-definition", start: command.start });
    }
    this.fail({ kind: "syntax", near: "(", start });
  }

  private parseRedirection(token: RedirectionToken): Redirection {
    const support = redirectionSupport(token.operator);
    if (!support.supported) {
      this.fail({ kind: "unsupported", feature: support.feature, start: token.start });
    }
    this.position += 1;
    const target = this.peek();
    if (target === undefined) {
      this.fail({ kind: "syntax", near: "newline", start: this.inputLength });
    }
    if (target.kind !== "word") {
      this.failNear(target);
    }
    this.position += 1;
    return {
      operator: support.operator,
      fd: token.fd,
      target: toArgumentWord(target),
      start: token.start,
      end: target.end,
    };
  }
}
