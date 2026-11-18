// The small text markup of catalog texts (ADR 0012, ADR 0073): `code`, **bold**, lists and
// paragraphs, without HTML. A formatted message (ADR 0072) is parsed into a tree that the UI
// renders with its own elements, so no text is ever read as HTML.
//
// - A line that starts with `- ` is a list item; consecutive items form a list.
// - Other lines form paragraphs; a line break inside a paragraph is kept.
// - An empty line (or one of spaces only) ends a paragraph or a list.
// - `**` opens and closes bold on the same line; an unpaired `**` stays as text.
// - Code spans were taken out before ICU formatting and arrive as code parts.
//
// Only text written in the catalog is read as markup; values of the game are text as they
// are. Parsing never fails: the checks when loading (`checkText`) report what would not show
// as the author meant.

import { type MessageFormatElement, TYPE } from "@formatjs/icu-messageformat-parser";

import {
  type CatalogText,
  checkMessage,
  compileMessage,
  type CompiledMessage,
  formatMessage,
  type MessagePart,
  type MessageProblem,
  type MessageRules,
  type TextValues,
} from "./message";

/** An inline piece of a formatted text. */
export type RichTextInline =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "code"; readonly text: string }
  | { readonly type: "bold"; readonly children: readonly RichTextInline[] }
  /** A line break inside a paragraph. */
  | { readonly type: "break" };

/** A block of a formatted text. */
export type RichTextBlock =
  | { readonly type: "paragraph"; readonly content: readonly RichTextInline[] }
  | { readonly type: "list"; readonly items: readonly (readonly RichTextInline[])[] };

/** A formatted text: its paragraphs and lists in order. */
export type RichText = readonly RichTextBlock[];

/** The marker of a list item at the start of a line. */
const LIST_MARKER = "- ";

/** The marker that opens and closes bold. */
const BOLD_MARKER = "**";

/** Formats a catalog text with values and parses its markup. Throws like `formatMessage`. */
export function formatText(text: CatalogText, values: TextValues = {}): RichText {
  return parseMarkup(formatMessage(text, values));
}

/**
 * Checks a catalog text that the game formats: ICU MessageFormat (ADR 0072) and, if that is
 * valid, the markup.
 */
export function checkText(source: string, language: string, rules: MessageRules): MessageProblem[] {
  const problems = checkMessage(source, language, rules);
  if (problems.length > 0) {
    return problems;
  }
  const compiled = compileMessage(source, language);
  return compiled.ok ? markupProblems(compiled.message) : [];
}

/** Parses the markup of a formatted message into blocks. */
export function parseMarkup(parts: readonly MessagePart[]): RichText {
  const blocks: RichTextBlock[] = [];
  let paragraph: RichTextInline[] | undefined;
  let list: (readonly RichTextInline[])[] | undefined;
  const end = (): void => {
    if (paragraph !== undefined) {
      blocks.push({ type: "paragraph", content: paragraph });
    }
    if (list !== undefined) {
      blocks.push({ type: "list", items: list });
    }
    paragraph = undefined;
    list = undefined;
  };
  for (const line of splitLines(parts)) {
    if (isBlank(line)) {
      end();
      continue;
    }
    const item = listItem(line);
    if (item !== undefined) {
      if (list === undefined) {
        end();
        list = [];
      }
      list.push(parseInline(item));
      continue;
    }
    if (paragraph === undefined) {
      end();
      paragraph = parseInline(line);
    } else {
      paragraph.push({ type: "break" }, ...parseInline(line));
    }
  }
  end();
  return blocks;
}

/** Splits the parts at the line breaks of catalog text; values and code stay whole. */
function splitLines(parts: readonly MessagePart[]): MessagePart[][] {
  const lines: MessagePart[][] = [[]];
  for (const part of parts) {
    if (part.kind !== "markup") {
      lines.at(-1)?.push(part);
      continue;
    }
    part.text.split("\n").forEach((text, index) => {
      if (index > 0) {
        lines.push([]);
      }
      if (text !== "") {
        lines.at(-1)?.push({ kind: "markup", text });
      }
    });
  }
  return lines;
}

/** A line without parts or with catalog text of spaces only. */
function isBlank(line: readonly MessagePart[]): boolean {
  return line.every((part) => part.kind === "markup" && part.text.trim() === "");
}

/** The content of a list item without its marker, or `undefined` for another line. */
function listItem(line: readonly MessagePart[]): MessagePart[] | undefined {
  const [first, ...rest] = line;
  if (first?.kind !== "markup" || !first.text.startsWith(LIST_MARKER)) {
    return undefined;
  }
  const text = first.text.slice(LIST_MARKER.length).trimStart();
  return text === "" ? rest : [{ kind: "markup", text }, ...rest];
}

/** A piece of a line: a part, or a bold marker found in catalog text. */
type Token = MessagePart | { readonly kind: "bold" };

/** Parses the inline markup of one line. */
function parseInline(line: readonly MessagePart[]): RichTextInline[] {
  const tokens: Token[] = [];
  for (const part of line) {
    if (part.kind !== "markup") {
      tokens.push(part);
      continue;
    }
    part.text.split(BOLD_MARKER).forEach((text, index) => {
      if (index > 0) {
        tokens.push({ kind: "bold" });
      }
      tokens.push({ kind: "markup", text });
    });
  }
  // Markers pair in order; an odd one out is text.
  const markers = tokens.filter((token) => token.kind === "bold").length;
  let unpaired = markers % 2 === 1;
  const lastMarker = tokens.findLastIndex((token) => token.kind === "bold");

  const result: RichTextInline[] = [];
  let bold: RichTextInline[] | undefined;
  tokens.forEach((token, index) => {
    const target = bold ?? result;
    switch (token.kind) {
      case "markup":
      case "text":
        appendText(target, token.text);
        return;
      case "code":
        target.push({ type: "code", text: token.text });
        return;
      case "bold":
        if (unpaired && index === lastMarker) {
          unpaired = false;
          appendText(target, BOLD_MARKER);
        } else if (bold === undefined) {
          bold = [];
        } else {
          if (bold.length > 0) {
            result.push({ type: "bold", children: bold });
          }
          bold = undefined;
        }
        return;
    }
  });
  return result;
}

/** Appends text, joined with text right before it. */
function appendText(inlines: RichTextInline[], text: string): void {
  if (text === "") {
    return;
  }
  const last = inlines.at(-1);
  if (last?.type === "text") {
    inlines[inlines.length - 1] = { type: "text", text: last.text + text };
  } else {
    inlines.push({ type: "text", text });
  }
}

/**
 * Problems of the markup of a valid message: bold that is not closed on its line or in its
 * option, empty bold, bold around an option with a line break, and empty list items.
 */
function markupProblems(message: CompiledMessage): MessageProblem[] {
  const problems: MessageProblem[] = [];
  const { icu, at } = message;

  /** Checks one list of elements: the whole message or one option. */
  const check = (elements: readonly MessageFormatElement[], option: boolean): void => {
    /** The ICU offset of the open bold marker, and whether anything followed it. */
    let open: { offset: number; empty: boolean } | undefined;
    let lineStart = !option;
    elements.forEach((element, index) => {
      if (element.type !== TYPE.literal) {
        if (open !== undefined) {
          open.empty = false;
        }
        if (element.type === TYPE.plural || element.type === TYPE.select) {
          const options = Object.values(element.options);
          for (const nested of options) {
            check(nested.value, true);
          }
          if (open !== undefined && options.some((nested) => hasLineBreak(nested.value))) {
            problems.push({
              offset: at(element.location?.start.offset ?? 0),
              message: "bold cannot go around an option that has a line break",
            });
          }
        }
        lineStart = false;
        return;
      }
      const start = element.location?.start.offset ?? 0;
      const end = element.location?.end.offset ?? start;
      const last = index === elements.length - 1;
      let offset = start;
      while (offset < end) {
        if (lineStart) {
          const lineEnd = icu.indexOf("\n", offset);
          const rest = icu.slice(offset, lineEnd === -1 || lineEnd > end ? end : lineEnd);
          const endsHere = (lineEnd !== -1 && lineEnd < end) || last;
          if (endsHere && /^-[ \t]*$/u.test(rest) && rest.startsWith(LIST_MARKER)) {
            problems.push({ offset: at(offset), message: "a list item must not be empty" });
          }
          lineStart = false;
        }
        if (icu.startsWith(BOLD_MARKER, offset)) {
          if (open === undefined) {
            open = { offset, empty: true };
          } else {
            if (open.empty) {
              problems.push({ offset: at(open.offset), message: "bold must not be empty" });
            }
            open = undefined;
          }
          offset += BOLD_MARKER.length;
          continue;
        }
        const char = icu.charAt(offset);
        if (char === "\n") {
          if (open !== undefined) {
            problems.push(unclosed(open.offset, "on its line"));
            open = undefined;
          }
          lineStart = true;
        } else if (open !== undefined && char.trim() !== "") {
          open.empty = false;
        }
        offset += 1;
      }
    });
    if (open !== undefined) {
      problems.push(unclosed(open.offset, option ? "in its option" : "on its line"));
    }
  };

  const unclosed = (icuOffset: number, where: string): MessageProblem => ({
    offset: at(icuOffset),
    message: `bold is not closed: the closing ** is missing ${where}`,
  });

  check(message.elements, false);
  return problems.sort((a, b) => a.offset - b.offset);
}

/** Whether catalog text in elements (also in nested options) has a line break. */
function hasLineBreak(elements: readonly MessageFormatElement[]): boolean {
  return elements.some((element) => {
    if (element.type === TYPE.literal) {
      return element.value.includes("\n");
    }
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      return Object.values(element.options).some((option) => hasLineBreak(option.value));
    }
    return false;
  });
}
