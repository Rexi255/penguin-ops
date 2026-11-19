// The catalog of design tokens that the styleguide page shows (ROADMAP M3.0c, ADR 0083). It reads
// the tokens straight from tokens.css, so the page cannot fall behind the stylesheet: every token
// lands in exactly one section, and a token that fits no section is listed as unsorted instead of
// being hidden. `token-catalog.test.ts` checks that no token of the real stylesheet is unsorted.
import { readCssRules, rootCustomProperties } from "../css-rules";

/** How the styleguide shows the tokens of a section. */
export type TokenKind =
  "color" | "cell" | "space" | "radius" | "line" | "shadow" | "motion" | "font";

/** A section of the styleguide and the token name prefixes it collects. */
export interface TokenSection {
  readonly id: string;
  readonly title: string;
  readonly kind: TokenKind;
  readonly prefixes: readonly string[];
}

/** A design token with its default value and the note written next to it in tokens.css. */
export interface Token {
  readonly name: string;
  readonly value: string;
  /** The comment at the end of the token's line, or an empty string. */
  readonly note: string;
}

/** A section with its tokens in the order of tokens.css. */
export interface CatalogSection {
  readonly section: TokenSection;
  readonly tokens: readonly Token[];
}

export interface TokenCatalog {
  readonly sections: readonly CatalogSection[];
  /** Tokens whose name matches no section prefix. */
  readonly unsorted: readonly Token[];
}

/** The sections in page order. A token belongs to the first section with a matching prefix. */
export const TOKEN_SECTIONS: readonly TokenSection[] = [
  { id: "colors", title: "Colours", kind: "color", prefixes: ["--color-"] },
  { id: "cell", title: "Character cell", kind: "cell", prefixes: ["--cell-"] },
  { id: "spacing", title: "Spacing", kind: "space", prefixes: ["--space-"] },
  { id: "shapes", title: "Shapes", kind: "radius", prefixes: ["--radius-"] },
  {
    id: "lines",
    title: "Line widths",
    kind: "line",
    prefixes: ["--border-width-", "--focus-offset"],
  },
  { id: "elevation", title: "Elevation", kind: "shadow", prefixes: ["--shadow-"] },
  { id: "motion", title: "Motion", kind: "motion", prefixes: ["--motion-"] },
  { id: "fonts", title: "Fonts", kind: "font", prefixes: ["--font-"] },
];

// A custom property declaration followed by a comment on the same line.
const TRAILING_NOTE = /^[ \t]*(--[\w-]+)[ \t]*:[^;\n]*;[ \t]*\/\*[ \t]*(.*?)[ \t]*\*\/[ \t]*$/gm;

/**
 * The notes written at the end of a token's line in a stylesheet, by token name. A token without
 * such a comment has no entry.
 */
export function readTokenNotes(css: string): ReadonlyMap<string, string> {
  const notes = new Map<string, string>();
  for (const match of css.matchAll(TRAILING_NOTE)) {
    const [, name = "", note = ""] = match;
    if (!notes.has(name)) {
      notes.set(name, note);
    }
  }
  return notes;
}

/** Sorts tokens into the given sections. Empty sections are left out. */
export function catalogTokens(
  tokens: ReadonlyMap<string, string>,
  notes: ReadonlyMap<string, string>,
  sections: readonly TokenSection[] = TOKEN_SECTIONS,
): TokenCatalog {
  const bySection = new Map<TokenSection, Token[]>(sections.map((section) => [section, []]));
  const unsorted: Token[] = [];
  for (const [name, value] of tokens) {
    const token: Token = { name, value, note: notes.get(name) ?? "" };
    const section = sections.find((candidate) =>
      candidate.prefixes.some((prefix) => name.startsWith(prefix)),
    );
    if (section === undefined) {
      unsorted.push(token);
    } else {
      bySection.get(section)?.push(token);
    }
  }
  return {
    sections: sections
      .map((section) => ({ section, tokens: bySection.get(section) ?? [] }))
      .filter((entry) => entry.tokens.length > 0),
    unsorted,
  };
}

/** The catalog of a token stylesheet such as tokens.css. */
export function readTokenCatalog(css: string): TokenCatalog {
  return catalogTokens(rootCustomProperties(readCssRules(css)), readTokenNotes(css));
}
