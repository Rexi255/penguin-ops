// A small reader for the project's own stylesheets (ADR 0082). It finds the rules with their
// declarations, the custom properties they use and colours written as literal values, so that
// tests can check the stylesheets against the design tokens. It is not a general CSS parser:
// it knows rules, nested at-rules such as @media, @font-face, comments and quoted strings, which
// is all the project's stylesheets use.

/** A style rule, or an @font-face rule, with the at-rules it is nested in. */
export interface CssRule {
  /**
   * The selector, with its whitespace collapsed, for example `:root` or `.menu`; for an
   * @font-face rule, `@font-face`.
   */
  readonly selector: string;
  /** The preludes of the enclosing at-rules, outermost first, for example `@media (…)`. */
  readonly conditions: readonly string[];
  /**
   * The declarations in source order: property name and value, both trimmed. For an @font-face
   * rule these are its descriptors (font-family, src and others).
   */
  readonly declarations: ReadonlyMap<string, string>;
}

/** A colour written as a literal value instead of a design token. */
export interface LiteralColor {
  readonly selector: string;
  readonly property: string;
  readonly value: string;
}

/** Thrown for a stylesheet this reader cannot read. */
export class CssReadError extends Error {
  override readonly name = "CssReadError";
}

const COMMENT = /\/\*[\s\S]*?\*\//g;

// An at-rule whose block holds descriptors like a style rule, instead of nested rules.
const FONT_FACE = /^@font-face$/i;

function collapse(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Returns the index after the closing quote of the string that starts at `start`. */
function skipString(css: string, start: number): number {
  const quote = css.charAt(start);
  let index = start + 1;
  while (index < css.length) {
    const char = css.charAt(index);
    if (char === "\\") {
      index += 2;
    } else if (char === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }
  throw new CssReadError(`A string that starts at offset ${String(start)} is not closed.`);
}

/** Returns the index of the `}` that closes the block whose `{` is at `open`. */
function findBlockEnd(css: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < css.length) {
    const char = css.charAt(index);
    if (char === '"' || char === "'") {
      index = skipString(css, index);
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
    index += 1;
  }
  throw new CssReadError(`The block that opens at offset ${String(open)} is not closed.`);
}

/** Splits a block body at the semicolons outside quoted strings. */
function splitDeclarations(body: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let index = 0;
  while (index < body.length) {
    const char = body.charAt(index);
    if (char === '"' || char === "'") {
      index = skipString(body, index);
      continue;
    }
    if (char === ";") {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  parts.push(body.slice(start));
  return parts;
}

function readDeclarations(body: string, selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const part of splitDeclarations(body)) {
    const declaration = part.trim();
    if (declaration === "") {
      continue;
    }
    const colon = declaration.indexOf(":");
    if (colon <= 0) {
      throw new CssReadError(`"${collapse(declaration)}" in "${selector}" is not a declaration.`);
    }
    const property = declaration.slice(0, colon).trim();
    if (declarations.has(property)) {
      throw new CssReadError(`"${selector}" declares ${property} twice.`);
    }
    declarations.set(property, collapse(declaration.slice(colon + 1)));
  }
  return declarations;
}

function readBlockContent(css: string, conditions: readonly string[], rules: CssRule[]): void {
  let preludeStart = 0;
  let index = 0;
  while (index < css.length) {
    const char = css.charAt(index);
    if (char === '"' || char === "'") {
      index = skipString(css, index);
      continue;
    }
    if (char === ";") {
      // A statement at-rule such as @import; it has no declarations.
      preludeStart = index + 1;
    } else if (char === "}") {
      throw new CssReadError(`There is a "}" without a "{" at offset ${String(index)}.`);
    } else if (char === "{") {
      const prelude = collapse(css.slice(preludeStart, index));
      const end = findBlockEnd(css, index);
      const body = css.slice(index + 1, end);
      if (prelude.startsWith("@") && !FONT_FACE.test(prelude)) {
        readBlockContent(body, [...conditions, prelude], rules);
      } else {
        rules.push({
          selector: prelude,
          conditions,
          declarations: readDeclarations(body, prelude),
        });
      }
      index = end + 1;
      preludeStart = index;
      continue;
    }
    index += 1;
  }
  if (collapse(css.slice(preludeStart)) !== "") {
    throw new CssReadError(`"${collapse(css.slice(preludeStart))}" is not followed by a block.`);
  }
}

/**
 * Reads every style rule and @font-face rule of a stylesheet, including the rules inside
 * at-rules.
 */
export function readCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  readBlockContent(css.replace(COMMENT, ""), [], rules);
  return rules;
}

/**
 * The custom properties of the single `:root` rule outside any at-rule: the design tokens with
 * their default values.
 */
export function rootCustomProperties(rules: readonly CssRule[]): ReadonlyMap<string, string> {
  const roots = rules.filter((rule) => rule.selector === ":root" && rule.conditions.length === 0);
  const [root] = roots;
  if (root === undefined || roots.length > 1) {
    throw new CssReadError(
      `Expected exactly one :root rule outside at-rules, found ${String(roots.length)}.`,
    );
  }
  return new Map([...root.declarations].filter(([property]) => property.startsWith("--")));
}

/** Every custom property a stylesheet reads with `var()`, without duplicates. */
export function usedCustomProperties(css: string): string[] {
  const names = new Set<string>();
  for (const match of css.replace(COMMENT, "").matchAll(/var\(\s*(--[\w-]+)/g)) {
    const [, name = ""] = match;
    names.add(name);
  }
  return [...names];
}

// The named colours of CSS Color Level 4. `transparent` and `currentcolor` are allowed: they
// name no colour of their own. System colours (Canvas, ButtonText and others) are not listed; the
// project does not use them.
const NAMED_COLORS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
    "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
    "crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
    "darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
    "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
    "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
    "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
    "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
    "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
    "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow " +
    "yellowgreen"
  ).split(" "),
);

const HEX_LITERAL = /#[0-9a-f]{3,8}\b/i;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;

function containsLiteralColor(value: string): boolean {
  // Quoted strings (font names, content) are text, not colours.
  const unquoted = value.replace(/"[^"]*"|'[^']*'/g, "");
  if (HEX_LITERAL.test(unquoted) || COLOR_FUNCTION.test(unquoted)) {
    return true;
  }
  // Whole words outside var() and without function names, so that neither "red" in a token name
  // such as --color-red nor the function tan() is a match.
  return unquoted
    .replace(/var\([^)]*\)/g, "")
    .replace(/[a-z-]+\(/gi, "(")
    .split(/[^a-z-]+/i)
    .some((word) => NAMED_COLORS.has(word.toLowerCase()));
}

/**
 * The declarations that write a colour as a literal value (hex, a colour function or a named
 * colour) instead of reading a design token. Custom property definitions are not checked: they
 * are the tokens themselves.
 */
export function findLiteralColors(rules: readonly CssRule[]): LiteralColor[] {
  const found: LiteralColor[] = [];
  for (const rule of rules) {
    for (const [property, value] of rule.declarations) {
      if (!property.startsWith("--") && containsLiteralColor(value)) {
        found.push({ selector: rule.selector, property, value });
      }
    }
  }
  return found;
}
