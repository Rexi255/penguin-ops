// Tab completion of the shell (ADR 0065): what bash 5.2 with readline 8.2 does on Debian 13 when
// the player presses Tab, with readline's default settings (`mark-directories` and
// `match-hidden-files` on, `show-all-if-ambiguous` off) and without the `bash-completion`
// package (no programmable completion). The UI owns the keys and the screen; this module only
// computes the new input line and the matches.

import { compareNames } from "./collation";
import { displayWidth } from "./display-width";
import type { FsNode } from "./fs-node";
import { openDirectory } from "./fs-read";
import { expandPathname, type PatternChar } from "./glob";
import { lookup } from "./lookup";
import { hasPermission } from "./permissions";
import type { Session } from "./session";
import { findHost, findUser, findUserByUid, type Host, type World } from "./world";

/** What a Tab press completes: the input line, the cursor in it and the session it belongs to. */
export interface CompletionRequest {
  readonly world: World;
  readonly session: Session;
  /**
   * The names of the commands the shell can run, the game's `PATH`. Real bash also offers its
   * builtins, keywords, aliases and functions; the game offers the commands it simulates.
   */
  readonly commandNames: readonly string[];
  readonly line: string;
  /** The cursor as an offset in `line` (UTF-16 code units), from 0 to `line.length`. */
  readonly cursor: number;
}

/** One match as readline lists it on the second Tab. */
export interface CompletionMatch {
  /** The part readline shows: the last component of a path, `~name`, `$NAME` or a command. */
  readonly name: string;
  /**
   * Whether readline marks the match with a `/` in the list: it is a directory, and its name does
   * not end with `/` already.
   */
  readonly directory: boolean;
}

/** The result of `complete`. */
export interface Completion {
  /** The input line after the Tab press; the same line if nothing was inserted. */
  readonly line: string;
  /** The cursor after the Tab press. */
  readonly cursor: number;
  /** Whether readline rings the bell: there was no match, or there are several. */
  readonly bell: boolean;
  /**
   * The matches readline lists when Tab is pressed again without a change, sorted like the
   * default English locale (`formatCompletionList` lays them out). Empty if nothing matches;
   * readline then rings the bell instead of listing.
   */
  readonly matches: readonly CompletionMatch[];
}

/** bash's `COMP_WORDBREAKS`: the characters that end the word to complete. */
const WORD_BREAKS = " \t\n\"'@><=;|&(:";

/** Word breaks that stay part of the word, readline's `rl_special_prefixes` in bash. */
const SPECIAL_PREFIXES = "$@";

/** bash's `command_separator_chars`: after one of them, a word is a command name. */
const COMMAND_SEPARATORS = ";|&{(`";

/** The characters a backslash escapes inside double quotes (bash's `CBSDQUOTE`). */
const DOUBLE_QUOTE_ESCAPABLE = '$`"\\\n';

/**
 * readline's `rl_filename_quote_characters` in bash: a match that contains one of them is
 * quoted before it is inserted.
 */
const QUOTE_TRIGGERS = " \t\n\\\"'@<>=;|&()#$`?*[!:{~";

/**
 * The characters that get a backslash when bash quotes a match without quotes. `#` and `~` get
 * one only at the start of the match.
 */
const BACKSLASH_QUOTED = " \t\n\\\"'$`!&()*,:;<=>?@[]^{|}";

/** readline's `completion-query-items`: from this many matches on, it asks before listing. */
export const COMPLETION_QUERY_ITEMS = 100;

/**
 * Computes what Tab does with the input line, like readline's `rl_complete` with bash's
 * completion functions:
 *
 * - The word to complete ends at the cursor. It starts after an unclosed `'` or `"`, else after
 *   the last unquoted character of `COMP_WORDBREAKS` (space, tab, newline, `"'@><=;|&(:`). A
 *   word that starts with `@` keeps it.
 * - A word that starts with `$` completes shell variable names (`$NAME`, `${NAME}`). A word that
 *   starts with `~` and has no `/` completes user names (`~name`).
 * - A word in command position (at the start of the line, after `;`, `|`, `&`, `{`, `(` or
 *   after assignments) completes command names from `commandNames`, or, with a `/`, the
 *   directories and executable files of that path.
 * - Otherwise a word with an unquoted `*`, `?` or `[` completes to the one path it matches as a
 *   pattern. If that gives nothing, the word completes as a file name: the entries of its
 *   directory part (after tilde expansion) that start with the rest, all entries but `.` and
 *   `..` for an empty rest. In command position only directories stay.
 * - Matching uses the word without its quotes and backslashes. The completed text gets
 *   backslashes (`my\ file`), or closes the quote the player opened (`"my file"`), like bash's
 *   `bash_quote_filename`. A tilde prefix the player typed stays as typed.
 *
 * One match replaces the word. At the end of the line a space follows, or a `/` for a
 * directory (also inside the line, unless a `/` follows already); a quote the player opened is
 * closed before the space. Several matches insert their longest common prefix and ring the bell.
 * No match rings the bell and changes nothing.
 *
 * The UI applies the result. Like readline, a second Tab right after one that left the line
 * unchanged lists `matches` (see `formatCompletionList` and `completionQuestion`).
 *
 * Throws a RangeError if the cursor is not a whole number from 0 to the line's length, and an
 * Error if the session's host is not part of the world.
 */
export function complete(request: CompletionRequest): Completion {
  const { world, session, line, cursor } = request;
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > line.length) {
    throw new RangeError(`the cursor ${String(cursor)} is not inside the line`);
  }
  const host = findHost(world, session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${session.host}" is not part of the world`);
  }
  const word = findWord(line, cursor);
  const context: Context = {
    world,
    session,
    host,
    commandNames: request.commandNames,
    word,
    commandPosition: inCommandPosition(line, word.start),
  };
  const forTab = candidatesFor(context, "tab");
  const forList = candidatesFor(context, "list");
  const matches = forList.candidates.map((candidate): CompletionMatch => {
    const name = forList.filenames ? printablePart(candidate.text) : candidate.text;
    // Like readline's `print_filename`, a name that ends with `/` gets no second one.
    return { name, directory: forList.filenames && candidate.directory && !name.endsWith("/") };
  });
  const unchanged: Completion = { line, cursor, bell: true, matches };
  const [first, second] = forTab.candidates;
  if (first === undefined) {
    return unchanged;
  }
  if (second === undefined) {
    return { ...insertSingle(context, line, cursor, forTab, first), bell: false, matches };
  }
  const prefix = commonPrefix(forTab.candidates.map((candidate) => candidate.text));
  const text = prefix === "" ? word.rawText : prefix;
  if (text === "") {
    return unchanged;
  }
  const inserted = insertText(context, line, cursor, forTab.filenames, text, "multiple");
  return { line: inserted.line, cursor: inserted.point, bell: true, matches };
}

/**
 * Returns readline's question before it lists `count` matches, or `undefined` if it lists them
 * without asking (fewer than `COMPLETION_QUERY_ITEMS`). The player answers with `y` (list them)
 * or `n` (do not).
 */
export function completionQuestion(count: number): string | undefined {
  return count >= COMPLETION_QUERY_ITEMS
    ? `Display all ${String(count)} possibilities? (y or n)`
    : undefined;
}

/**
 * Lays out `matches` for a terminal `columns` wide like readline's `rl_display_match_list`:
 * sorted down the columns like `ls`, each column as wide as the widest name plus two spaces,
 * directories marked with `/`, and control characters shown as `^X`. Every row ends with a line
 * break; the last column of the widest layout gets no padding. Returns the empty text for no
 * matches. Throws a RangeError if `columns` is not a whole number from 1 on.
 */
export function formatCompletionList(matches: readonly CompletionMatch[], columns: number): string {
  if (!Number.isInteger(columns) || columns < 1) {
    throw new RangeError(`the terminal width ${String(columns)} is not a whole number from 1 on`);
  }
  if (matches.length === 0) {
    return "";
  }
  const shown = matches.map((match) => ({
    text: visibleName(match.name) + (match.directory ? "/" : ""),
    width: displayWidth(visibleName(match.name)) + (match.directory ? 1 : 0),
    nameWidth: displayWidth(visibleName(match.name)),
  }));
  const max = Math.max(...shown.map((item) => item.nameWidth)) + 2;
  let limit = Math.floor(columns / max);
  if (limit !== 1 && limit * max === columns) {
    limit -= 1;
  }
  limit = Math.max(limit, 1);
  const rows = Math.ceil(shown.length / limit);
  let output = "";
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < limit; column += 1) {
      const item = shown[row + column * rows];
      if (item === undefined) {
        break;
      }
      output += item.text;
      if (column + 1 < limit) {
        output += " ".repeat(max - item.width);
      }
    }
    output += "\n";
  }
  return output;
}

/** A name as readline prints it in a list: control characters as `^X`, DEL as `^?`. */
function visibleName(name: string): string {
  return Array.from(name)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      if (code < 0x20) {
        return `^${String.fromCodePoint(code + 0x40)}`;
      }
      return code === 0x7f ? "^?" : character;
    })
    .join("");
}

/** The word to complete. */
interface CompletionWord {
  /** Where the replacement starts: after an opening quote if the word is inside one. */
  readonly start: number;
  /** The quote the word is inside (`'` or `"`), or "" if none. */
  readonly quote: string;
  /** The text from `start` to the cursor, as typed. */
  readonly rawText: string;
}

/** Everything the completion of one word needs. */
interface Context {
  readonly world: World;
  readonly session: Session;
  readonly host: Host;
  readonly commandNames: readonly string[];
  readonly word: CompletionWord;
  readonly commandPosition: boolean;
}

/** A possible completion: the full text that replaces the word, and whether it is a directory. */
interface Candidate {
  readonly text: string;
  readonly directory: boolean;
}

/**
 * The candidates of one completion attempt, sorted and without repeats. `filenames` is
 * readline's `rl_filename_completion_desired`: the candidates are paths (also commands and
 * `~name`), which are quoted, marked as directories and shown by their last component.
 */
interface Candidates {
  readonly candidates: readonly Candidate[];
  readonly filenames: boolean;
}

const NONE: Candidates = { candidates: [], filenames: false };

/**
 * Finds the word to complete like readline's `_rl_find_completion_word` with bash's
 * `char_is_quoted`: the scan from the start of the line remembers the last unclosed quote; if
 * there is none, the word starts after the last unquoted word break before the cursor.
 */
function findWord(line: string, end: number): CompletionWord {
  let point = end;
  let quote = "";
  let foundQuote = false;
  let passNext = false;
  for (let scan = 0; scan < end; scan += 1) {
    const c = line[scan];
    if (passNext) {
      passNext = false;
    } else if (quote !== "'" && c === "\\") {
      passNext = true;
      foundQuote = true;
    } else if (quote !== "") {
      if (c === quote) {
        quote = "";
        point = end;
      }
    } else if (c === "'" || c === '"') {
      quote = c;
      point = scan + 1;
      foundQuote = true;
    }
  }
  if (point === end && quote === "") {
    point = Math.max(end - 1, 0);
    while (point > 0) {
      const c = line[point] ?? "";
      if (WORD_BREAKS.includes(c) && !(foundQuote && isQuoted(line, point))) {
        break;
      }
      point -= 1;
    }
  }
  const c = line[point];
  if (c !== undefined && point < end) {
    const isBreak = WORD_BREAKS.includes(c) && !(foundQuote && isQuoted(line, point));
    if (isBreak && !SPECIAL_PREFIXES.includes(c)) {
      point += 1;
    }
  }
  return { start: point, quote, rawText: line.slice(point, end) };
}

/**
 * Whether the character at `index` is quoted, like bash's `char_is_quoted`: it follows a
 * backslash, or it is inside quotes or one of the quotes themselves. An unclosed quote reaches
 * to the end of the line.
 */
function isQuoted(line: string, index: number): boolean {
  let i = 0;
  while (i <= index) {
    const c = line[i];
    if (c === "\\") {
      if (i + 1 === index) {
        return true;
      }
      i += 2;
    } else if (c === "'" || c === '"') {
      const next = afterClosingQuote(line, i);
      if (next > index) {
        return true;
      }
      i = next;
    } else {
      i += 1;
    }
  }
  return false;
}

/** The index after the quote that closes the one at `open`, or the line's length. */
function afterClosingQuote(line: string, open: number): number {
  const quote = line[open];
  for (let i = open + 1; i < line.length; i += 1) {
    const c = line[i];
    if (quote === '"' && c === "\\") {
      i += 1;
    } else if (c === quote) {
      return i + 1;
    }
  }
  return line.length;
}

/**
 * Whether the word starting at `start` is a command name, like bash's check in
 * `attempt_shell_completion`: before it, after blanks, comes the start of the line or an
 * unquoted command separator that is not part of a redirection (`>&`, `<&`, `>|`) or of `${`.
 * Assignments in front of a command name (`A=1 cmd`) are skipped.
 */
function inCommandPosition(line: string, start: number): boolean {
  let ti = start - 1;
  for (;;) {
    while (ti >= 0 && (line[ti] === " " || line[ti] === "\t")) {
      ti -= 1;
    }
    if (ti < 0) {
      return true;
    }
    const c = line[ti] ?? "";
    if (COMMAND_SEPARATORS.includes(c)) {
      return !isRedirectionOrQuoted(line, ti);
    }
    if (ti + 1 >= start || (line[ti + 1] !== " " && line[ti + 1] !== "\t")) {
      return false;
    }
    let wordStart = ti;
    while (wordStart > 0 && !isUnquotedBlankOrSeparator(line, wordStart - 1)) {
      wordStart -= 1;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*\+?=/u.test(line.slice(wordStart, ti + 1))) {
      return false;
    }
    ti = wordStart - 1;
  }
}

function isUnquotedBlankOrSeparator(line: string, index: number): boolean {
  const c = line[index] ?? "";
  return (c === " " || c === "\t" || COMMAND_SEPARATORS.includes(c)) && !isQuoted(line, index);
}

/** bash's `check_redir`: the separator at `ti` belongs to a redirection, to `${`, or is quoted. */
function isRedirectionOrQuoted(line: string, ti: number): boolean {
  const c = line[ti];
  const before = ti > 0 ? line[ti - 1] : undefined;
  if (c === "&" && (before === "<" || before === ">")) {
    return true;
  }
  if (c === "|" && before === ">") {
    return true;
  }
  if (c === "{" && before === "$") {
    return true;
  }
  return isQuoted(line, ti);
}

/**
 * The candidates for a Tab press (`tab`) or for the list (`list`), in the order of bash's
 * `attempt_shell_completion`: variables, user names, commands, a pattern, then file names. A
 * pattern that matches several paths counts for the list only; for Tab, the file names follow.
 * In command position, file names and patterns keep only directories.
 */
function candidatesFor(context: Context, mode: "tab" | "list"): Candidates {
  const raw = context.word.rawText;
  if (raw.startsWith("$")) {
    const variables = variableCandidates(context, raw);
    if (variables.candidates.length > 0) {
      return variables;
    }
  }
  if (raw.startsWith("~") && !raw.includes("/")) {
    const users = userCandidates(context, raw);
    if (users.candidates.length > 0) {
      return users;
    }
  }
  const chars = dequote(raw, context.word.quote);
  const text = chars.map((char) => char.c).join("");
  if (context.commandPosition) {
    const commands = commandCandidates(context, text);
    if (commands.candidates.length > 0) {
      return commands;
    }
  }
  // In command position, bash keeps only directories of the file names and patterns
  // (`bash_ignore_filenames`).
  const keep = (candidate: Candidate): boolean => !context.commandPosition || candidate.directory;
  const pattern = patternCandidates(context, chars, keep);
  if (pattern.candidates.length === 1 || (mode === "list" && pattern.candidates.length > 1)) {
    return pattern;
  }
  return filenameCandidates(context, text, keep);
}

/**
 * Shell variables whose names start with the text after `$` or `${`, as `$NAME` or `${NAME}`,
 * like bash's `variable_completion_function`.
 */
function variableCandidates(context: Context, raw: string): Candidates {
  const braced = raw.startsWith("${");
  const prefix = raw.slice(braced ? 2 : 1);
  const names = [...context.session.variables.keys()].filter((name) => name.startsWith(prefix));
  const candidates = names.map((name): Candidate => ({
    text: braced ? `\${${name}}` : `$${name}`,
    directory: isDirectory(context, context.session.variables.get(name) ?? ""),
  }));
  return { candidates: sortCandidates(candidates), filenames: false };
}

/** The users of the host whose names start with the text after `~`, as `~name`. */
function userCandidates(context: Context, raw: string): Candidates {
  const prefix = raw.slice(1);
  const candidates = context.host.users
    .filter((user) => user.name.startsWith(prefix))
    .map((user): Candidate => ({
      text: `~${user.name}`,
      directory: isDirectory(context, user.home),
    }));
  return { candidates: sortCandidates(candidates), filenames: true };
}

/**
 * Command names for a word in command position, like bash's `command_word_completion_function`:
 * a word with a `/` completes the directories and executable files of its path, any other word
 * the commands whose names start with it.
 */
function commandCandidates(context: Context, text: string): Candidates {
  if (text.includes("/")) {
    return filenameCandidates(
      context,
      text,
      (candidate, node) =>
        candidate.directory ||
        (node !== undefined && hasPermission(node, context.session.credentials, "execute")),
    );
  }
  const candidates = context.commandNames
    .filter((name) => name.startsWith(text))
    .map((name): Candidate => ({ text: name, directory: isDirectory(context, name) }));
  return { candidates: sortCandidates(candidates), filenames: true };
}

/**
 * The paths that the word matches as a pattern, like bash's `glob_complete_word`: only if it has
 * an unquoted `*`, `?` or `[`. A word with a tilde prefix is not expanded as a pattern.
 */
function patternCandidates(
  context: Context,
  chars: readonly PatternChar[],
  keep: (candidate: Candidate) => boolean,
): Candidates {
  const first = chars[0];
  if (first?.c === "~" && !first.quoted) {
    return NONE;
  }
  const { host, session } = context;
  const paths = expandPathname(chars, host.root, session.credentials, session.cwd);
  const candidates = paths
    .map((path): Candidate => ({ text: path, directory: isDirectory(context, path) }))
    .filter(keep);
  return { candidates: sortCandidates(candidates), filenames: true };
}

/**
 * File names like readline's `rl_filename_completion_function`: the entries of the directory
 * part of `text` (after tilde expansion; `.` if there is none) whose names start with the rest,
 * each as the directory part followed by the name. An empty rest gives all entries but `.` and
 * `..`, also hidden ones. A directory part with `$` (a variable) is not expanded and completes
 * nothing. `keep` filters the candidates.
 */
function filenameCandidates(
  context: Context,
  text: string,
  keep: (candidate: Candidate, node: FsNode | undefined) => boolean,
): Candidates {
  const slash = text.lastIndexOf("/");
  const directoryPart = text.slice(0, slash + 1);
  const prefix = text.slice(slash + 1);
  if (directoryPart.includes("$")) {
    return NONE;
  }
  const directory = directoryPart === "" ? "." : expandTilde(context, directoryPart);
  const listing = openDirectory(context.world, context.session, directory);
  if (!listing.ok) {
    return NONE;
  }
  const candidates = listing.entries
    .filter((entry) =>
      prefix === "" ? entry.name !== "." && entry.name !== ".." : entry.name.startsWith(prefix),
    )
    .map((entry) => directoryPart + entry.name)
    .map((path) => {
      const node = nodeAt(context, path);
      const candidate: Candidate = { text: path, directory: node?.kind === "directory" };
      return { candidate, node };
    })
    .filter(({ candidate, node }) => keep(candidate, node))
    .map(({ candidate }) => candidate);
  return { candidates: sortCandidates(candidates), filenames: true };
}

/** The node at `path` (after tilde expansion) as the session's user sees it, or `undefined`. */
function nodeAt(context: Context, path: string): FsNode | undefined {
  const { host, session } = context;
  const found = lookup(host.root, session.credentials, session.cwd, expandTilde(context, path));
  return found.ok ? found.node : undefined;
}

/** Whether `path` (after tilde expansion) is a directory the session's user can reach. */
function isDirectory(context: Context, path: string): boolean {
  return path !== "" && nodeAt(context, path)?.kind === "directory";
}

/**
 * Expands a tilde prefix at the start of `path` like readline's `tilde_expand`: `~` is `HOME`
 * (or the home of the session's user if `HOME` is unset), `~name` the home of the user `name`.
 * A path without a tilde prefix, or with an unknown user, stays as it is.
 */
function expandTilde(context: Context, path: string): string {
  if (!path.startsWith("~")) {
    return path;
  }
  const slash = path.indexOf("/");
  const name = path.slice(1, slash === -1 ? undefined : slash);
  const rest = slash === -1 ? "" : path.slice(slash);
  const { host, session } = context;
  const home =
    name === ""
      ? (session.variables.get("HOME") ?? findUserByUid(host, session.credentials.uid)?.home)
      : findUser(host, name)?.home;
  return home === undefined ? path : home + rest;
}

/**
 * Removes quotes and backslashes from the typed word like bash's `bash_dequote_filename`,
 * starting inside the quote `quote` if the word starts inside one. Each character remembers
 * whether it was quoted, for patterns. Inside single quotes a backslash stays; inside double
 * quotes it stays unless it escapes `$`, `` ` ``, `"`, `\` or a newline.
 */
function dequote(raw: string, quote: string): readonly PatternChar[] {
  const chars: PatternChar[] = [];
  let quoted = quote;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i] ?? "";
    if (c === "\\") {
      const next = raw[i + 1];
      if (quoted === "'" || (quoted === '"' && !DOUBLE_QUOTE_ESCAPABLE.includes(next ?? ""))) {
        chars.push({ c, quoted: true });
      }
      if (next === undefined) {
        break;
      }
      chars.push({ c: next, quoted: true });
      i += 1;
    } else if (quoted !== "" && c === quoted) {
      quoted = "";
    } else if (quoted === "" && (c === "'" || c === '"')) {
      quoted = c;
    } else {
      chars.push({ c, quoted: quoted !== "" });
    }
  }
  return chars;
}

/** Sorts candidates like the default English locale and removes repeated texts. */
function sortCandidates(candidates: readonly Candidate[]): readonly Candidate[] {
  const sorted = [...candidates].sort((a, b) => compareNames(a.text, b.text));
  return sorted.filter((candidate, index) => sorted[index - 1]?.text !== candidate.text);
}

/** The longest common prefix of `texts`, by code points. */
function commonPrefix(texts: readonly string[]): string {
  const [first = [], ...rest] = texts.map((text) => Array.from(text));
  let length = first.length;
  for (const text of rest) {
    let same = 0;
    while (same < length && text[same] === first[same]) {
      same += 1;
    }
    length = same;
  }
  return first.slice(0, length).join("");
}

/**
 * What readline lists for a path, its `printable_part`: the text after the last `/`, or after
 * the one before it if the path ends with `/`. A `~name` without `/` stays whole.
 */
function printablePart(text: string): string {
  const slash = text.lastIndexOf("/");
  if (slash === -1) {
    return text;
  }
  if (slash < text.length - 1) {
    return text.slice(slash + 1);
  }
  const before = text.lastIndexOf("/", slash - 1);
  return before === -1 ? text : text.slice(before + 1);
}

/**
 * Inserts the one candidate, then what readline's `append_to_match` adds: for a path that is a
 * directory a `/` (unless a `/` follows, or ends the line already), else at the end of the line
 * the closing quote and a space. A variable naming a directory gets a `/` instead of the space.
 */
function insertSingle(
  context: Context,
  line: string,
  cursor: number,
  set: Candidates,
  candidate: Candidate,
): { readonly line: string; readonly cursor: number } {
  const inserted = insertText(context, line, cursor, set.filenames, candidate.text, "single");
  const { point, quote } = inserted;
  let result = inserted.line;
  const atEnd = point === result.length;
  const closing = quote !== "" && point > 0 && result[point - 1] !== quote ? quote : "";
  if (set.filenames && candidate.directory) {
    if ((atEnd && result[point - 1] === "/") || result[point] === "/") {
      return { line: result, cursor: point };
    }
    result = `${result.slice(0, point)}/${result.slice(point)}`;
    return { line: result, cursor: point + 1 };
  }
  if (!atEnd) {
    return { line: result, cursor: point };
  }
  const append = closing + (!set.filenames && candidate.directory ? "/" : " ");
  return { line: result + append, cursor: point + append.length };
}

/**
 * Replaces the word with `text`, quoted like readline's `make_quoted_replacement` and bash's
 * `bash_quote_filename`, like readline's `insert_match`. Returns the new line, the point after
 * the inserted text and the quote that is open there.
 */
function insertText(
  context: Context,
  line: string,
  cursor: number,
  filenames: boolean,
  text: string,
  kind: "single" | "multiple",
): { readonly line: string; readonly point: number; readonly quote: string } {
  const word = context.word;
  const quoted = filenames ? quoteMatch(text, kind, word) : { text, quote: word.quote };
  const replacement = quoted.text;
  let start = word.start;
  const before = line[start - 1];
  if (quoted.quote !== "" && before === quoted.quote && replacement.startsWith(quoted.quote)) {
    start -= 1;
  } else if (
    quoted.quote !== word.quote &&
    word.quote !== "" &&
    before === word.quote &&
    !replacement.startsWith(word.quote)
  ) {
    start -= 1;
  }
  return {
    line: line.slice(0, start) + replacement + line.slice(cursor),
    point: start + replacement.length,
    quote: quoted.quote,
  };
}

/**
 * Quotes a match for the shell like bash 5.2's `bash_quote_filename`, if it contains a
 * character of `QUOTE_TRIGGERS`: with backslashes if the player opened no quote (single quotes
 * if the match has a newline), else in the player's quotes. A double-quoted match with `!`
 * (history expansion) gets backslashes instead and leaves the quote. Several matches lose the
 * closing quote. A tilde prefix the player typed stays unquoted.
 */
function quoteMatch(
  match: string,
  kind: "single" | "multiple",
  word: CompletionWord,
): { readonly text: string; readonly quote: string } {
  if (!Array.from(match).some((c) => QUOTE_TRIGGERS.includes(c))) {
    return { text: match, quote: word.quote };
  }
  let quote = word.quote;
  let style: "backslash" | "single" | "double" = "backslash";
  if (quote === "" && match.includes("\n")) {
    style = "single";
  } else if (quote === '"') {
    style = "double";
  } else if (quote === "'") {
    style = "single";
  }
  if (style === "double" && match.includes("!")) {
    style = "backslash";
    quote = "";
  }
  const typedTilde = word.quote === "" && word.rawText.startsWith("~") && match.startsWith("~");
  const prefixLength = typedTilde ? tildePrefixLength(match) : 0;
  const prefix = match.slice(0, prefixLength);
  const rest = match.slice(prefixLength);
  let text: string;
  switch (style) {
    case "backslash":
      text = prefix + backslashQuote(rest, prefix === "");
      break;
    case "single":
      text = `${prefix}'${rest.replaceAll("'", "'\\''")}'`;
      break;
    case "double":
      text = `${prefix}"${Array.from(rest)
        .map((c) => (DOUBLE_QUOTE_ESCAPABLE.includes(c) && c !== "\n" ? `\\${c}` : c))
        .join("")}"`;
      break;
  }
  if (kind === "multiple" && style !== "backslash") {
    text = text.slice(0, -1);
  }
  return { text, quote };
}

/** The length of the tilde prefix of `match`: up to the first `/`, or all of it. */
function tildePrefixLength(match: string): number {
  const slash = match.indexOf("/");
  return slash === -1 ? match.length : slash;
}

/**
 * Puts a backslash before each character of `BACKSLASH_QUOTED`, like bash's
 * `sh_backslash_quote`; before `#` and `~` only at the start (if `atStart`).
 */
function backslashQuote(text: string, atStart: boolean): string {
  return Array.from(text)
    .map((c, index) => {
      const first = atStart && index === 0;
      const quote = BACKSLASH_QUOTED.includes(c) || (first && (c === "#" || c === "~"));
      return quote ? `\\${c}` : c;
    })
    .join("");
}
