// Pathname expansion of the shell (ADR 0046): an unquoted `*`, `?` or bracket expression turns a
// word into the sorted list of the paths it matches, like bash 5.2 with its default options
// (no `dotglob`, `nullglob`, `failglob`, `extglob` or `nocaseglob`; `globskipdots` and
// `globasciiranges` on). Quoted characters always match themselves.

import { compareNames } from "./collation";
import type { Credentials } from "./credentials";
import type { DirectoryNode } from "./fs-node";
import { lookup } from "./lookup";
import { hasPermission } from "./permissions";

/** One character of a word after field splitting, and whether it was quoted. */
export interface PatternChar {
  readonly c: string;
  readonly quoted: boolean;
}

/** Something a bracket expression lists: a character, a range (`a-z`) or a class (`[:digit:]`). */
type BracketItem =
  | { readonly kind: "char"; readonly c: string }
  | { readonly kind: "range"; readonly from: string; readonly to: string }
  | { readonly kind: "class"; readonly name: string };

/** One element of a compiled pattern. */
type PatternToken =
  | { readonly kind: "literal"; readonly c: string }
  | { readonly kind: "any" }
  | { readonly kind: "star" }
  | { readonly kind: "bracket"; readonly negated: boolean; readonly items: readonly BracketItem[] };

/** A path component: its text, and its tokens if it contains a pattern. */
interface Component {
  readonly text: string;
  readonly tokens: readonly PatternToken[] | undefined;
}

/** The character classes of bracket expressions. Non-ASCII characters by Unicode category. */
const CHARACTER_CLASSES: ReadonlyMap<string, (c: string) => boolean> = new Map([
  ["alnum", (c) => /^[\p{L}\p{Nd}]$/u.test(c)],
  ["alpha", (c) => /^\p{L}$/u.test(c)],
  ["ascii", (c) => codePoint(c) <= 0x7f],
  ["blank", (c) => /^[ \t]$/u.test(c)],
  ["cntrl", (c) => /^\p{Cc}$/u.test(c)],
  ["digit", (c) => /^[0-9]$/u.test(c)],
  ["graph", (c) => /^[^\p{Z}\p{C}]$/u.test(c)],
  ["lower", (c) => /^\p{Ll}$/u.test(c)],
  ["print", (c) => /^[^\p{Zl}\p{Zp}\p{C}]$/u.test(c)],
  ["punct", (c) => /^[^\p{Z}\p{C}\p{L}\p{Nd}]$/u.test(c)],
  ["space", (c) => /^[ \t\n\v\f\r]$/u.test(c)],
  ["upper", (c) => /^\p{Lu}$/u.test(c)],
  ["word", (c) => /^[\p{L}\p{Nd}_]$/u.test(c)],
  ["xdigit", (c) => /^[0-9A-Fa-f]$/u.test(c)],
]);

/**
 * Expands `chars` as a pathname pattern for the user with `credentials` whose working directory
 * is `cwd`, in the file system below `root`. Returns the matching paths sorted like bash in the
 * default English locale (`compareNames`), or an empty list if the word contains no pattern or
 * nothing matches; the shell then keeps the word as it is.
 *
 * - The pattern is split at every `/`; each component with a pattern is matched against the
 *   entries of the directories found so far. Reading a directory needs read permission on it and
 *   search permission on the way to it; a directory that cannot be read gives no matches.
 * - `*` matches any characters, `?` one character, `[…]` one character of the set (`[!…]` and
 *   `[^…]` negate it; ranges and `[:class:]`, `[=c=]`, `[.c.]` are supported). A `[` without a
 *   closing `]` is an ordinary character.
 * - A name that starts with `.` matches only if the pattern starts with a literal `.`; `.` and
 *   `..` never match.
 * - The parts of the word without a pattern stay as written. If they follow the last pattern,
 *   the path must exist; a trailing `/` lets only directories match.
 */
export function expandPathname(
  chars: readonly PatternChar[],
  root: DirectoryNode,
  credentials: Credentials,
  cwd: string,
): readonly string[] {
  const components = splitComponents(chars).map(compileComponent);
  const lastPattern = components.findLastIndex((component) => component.tokens !== undefined);
  if (lastPattern === -1) {
    return [];
  }
  let paths: readonly string[] = [""];
  components.forEach((component, index) => {
    const tokens = component.tokens;
    if (tokens === undefined) {
      paths = paths.map((path) => joinComponent(path, component.text, index));
      return;
    }
    paths = paths.flatMap((path) =>
      matchingEntries(root, credentials, cwd, directoryOf(path, index), tokens).map((name) =>
        joinComponent(path, name, index),
      ),
    );
  });
  if (lastPattern < components.length - 1) {
    paths = paths.filter((path) => lookup(root, credentials, cwd, path).ok);
  }
  return [...paths].sort(compareNames);
}

function splitComponents(chars: readonly PatternChar[]): readonly (readonly PatternChar[])[] {
  const components: PatternChar[][] = [[]];
  for (const char of chars) {
    if (char.c === "/") {
      components.push([]);
    } else {
      components.at(-1)?.push(char);
    }
  }
  return components;
}

function joinComponent(path: string, name: string, index: number): string {
  return index === 0 ? name : `${path}/${name}`;
}

/** The directory whose entries the component at `index` is matched against. */
function directoryOf(path: string, index: number): string {
  if (index === 0) {
    return ".";
  }
  return path === "" ? "/" : path;
}

function matchingEntries(
  root: DirectoryNode,
  credentials: Credentials,
  cwd: string,
  directory: string,
  tokens: readonly PatternToken[],
): readonly string[] {
  const found = lookup(root, credentials, cwd, directory);
  if (!found.ok || found.node.kind !== "directory") {
    return [];
  }
  if (!hasPermission(found.node, credentials, "read")) {
    return [];
  }
  return [...found.node.entries.keys()].filter((name) => matchesName(tokens, name));
}

function matchesName(tokens: readonly PatternToken[], name: string): boolean {
  const first = tokens[0];
  const startsWithLiteralDot = first?.kind === "literal" && first.c === ".";
  if (name.startsWith(".") && !startsWithLiteralDot) {
    return false;
  }
  return matches(tokens, Array.from(name));
}

/** Matches `tokens` against all of `chars`; a `*` backtracks to its latest position. */
function matches(tokens: readonly PatternToken[], chars: readonly string[]): boolean {
  let t = 0;
  let s = 0;
  let starToken = -1;
  let starPosition = 0;
  while (s < chars.length) {
    const token = tokens[t];
    const char = chars[s] ?? "";
    if (token?.kind === "star") {
      starToken = t;
      starPosition = s;
      t += 1;
    } else if (token !== undefined && matchesChar(token, char)) {
      t += 1;
      s += 1;
    } else if (starToken !== -1) {
      starPosition += 1;
      t = starToken + 1;
      s = starPosition;
    } else {
      return false;
    }
  }
  return tokens.slice(t).every((token) => token.kind === "star");
}

function matchesChar(token: Exclude<PatternToken, { kind: "star" }>, c: string): boolean {
  switch (token.kind) {
    case "literal":
      return token.c === c;
    case "any":
      return true;
    case "bracket":
      return token.items.some((item) => matchesItem(item, c)) !== token.negated;
  }
}

function matchesItem(item: BracketItem, c: string): boolean {
  switch (item.kind) {
    case "char":
      return item.c === c;
    case "range":
      return codePoint(item.from) <= codePoint(c) && codePoint(c) <= codePoint(item.to);
    case "class":
      return CHARACTER_CLASSES.get(item.name)?.(c) ?? false;
  }
}

function codePoint(c: string): number {
  return c.codePointAt(0) ?? 0;
}

/** Compiles a component; `tokens` stays undefined if it has no `*`, `?` or bracket expression. */
function compileComponent(chars: readonly PatternChar[]): Component {
  const text = chars.map((char) => char.c).join("");
  const tokens: PatternToken[] = [];
  let isPattern = false;
  let i = 0;
  while (i < chars.length) {
    const char = chars[i] ?? { c: "", quoted: true };
    if (!char.quoted && char.c === "*") {
      tokens.push({ kind: "star" });
      isPattern = true;
      i += 1;
    } else if (!char.quoted && char.c === "?") {
      tokens.push({ kind: "any" });
      isPattern = true;
      i += 1;
    } else if (!char.quoted && char.c === "[") {
      const bracket = parseBracket(chars, i);
      if (bracket === undefined) {
        tokens.push({ kind: "literal", c: "[" });
        i += 1;
      } else {
        tokens.push(bracket.token);
        isPattern = true;
        i = bracket.end;
      }
    } else {
      tokens.push({ kind: "literal", c: char.c });
      i += 1;
    }
  }
  return { text, tokens: isPattern ? tokens : undefined };
}

function isUnquoted(chars: readonly PatternChar[], index: number, c: string): boolean {
  const char = chars[index];
  return char !== undefined && !char.quoted && char.c === c;
}

/**
 * Parses the bracket expression that starts with the `[` at `start`. Returns the token and the
 * index after the closing `]`, or undefined if there is no closing `]`. A `]` right after the
 * `[` (or after `[!`) is an ordinary member, as are quoted characters.
 */
function parseBracket(
  chars: readonly PatternChar[],
  start: number,
): { readonly token: PatternToken; readonly end: number } | undefined {
  let i = start + 1;
  const negated = isUnquoted(chars, i, "!") || isUnquoted(chars, i, "^");
  if (negated) {
    i += 1;
  }
  const items: BracketItem[] = [];
  let first = true;
  while (i < chars.length) {
    if (!first && isUnquoted(chars, i, "]")) {
      return { token: { kind: "bracket", negated, items }, end: i + 1 };
    }
    first = false;
    const special = parseBracketSpecial(chars, i);
    if (special !== undefined) {
      items.push(special.item);
      i = special.end;
      continue;
    }
    const from = chars[i]?.c ?? "";
    const to = chars[i + 2];
    if (isUnquoted(chars, i + 1, "-") && to !== undefined && !isUnquoted(chars, i + 2, "]")) {
      items.push({ kind: "range", from, to: to.c });
      i += 3;
    } else {
      items.push({ kind: "char", c: from });
      i += 1;
    }
  }
  return undefined;
}

/** Parses `[:name:]`, `[=c=]` or `[.c.]` at `start`, if one starts there. */
function parseBracketSpecial(
  chars: readonly PatternChar[],
  start: number,
): { readonly item: BracketItem; readonly end: number } | undefined {
  if (!isUnquoted(chars, start, "[")) {
    return undefined;
  }
  const delimiter = chars[start + 1];
  if (delimiter === undefined || delimiter.quoted || !":=.".includes(delimiter.c)) {
    return undefined;
  }
  for (let i = start + 2; i + 1 < chars.length; i += 1) {
    if (isUnquoted(chars, i, delimiter.c) && isUnquoted(chars, i + 1, "]")) {
      const inner = chars
        .slice(start + 2, i)
        .map((char) => char.c)
        .join("");
      const item: BracketItem =
        delimiter.c === ":" ? { kind: "class", name: inner } : { kind: "char", c: inner };
      return { item, end: i + 2 };
    }
  }
  return undefined;
}
