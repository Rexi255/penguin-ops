// Reads the text of a YAML content file (ADR 0069). The `yaml` library keeps the position of
// every node, so that schema problems found later in the parsed value can be traced back to
// the line and column of the file. YAML 1.2 with the core schema: `yes` stays a string and
// `0640` is the number 640. Errors and warnings of the parser are both problems: content files
// must be clean.

import {
  type Document,
  isMap,
  isNode,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  visit,
} from "yaml";

import { type ContentProblem, formatDataPath } from "./content-problem";

/** A position in a file, both starting at 1. */
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

/** A parsed YAML file: its value and the positions of its nodes. */
export interface YamlSource {
  readonly file: string;
  /** The value as plain JavaScript data. */
  readonly value: unknown;
  /**
   * The position of the data at `path`, or of its nearest ancestor in the file: a map entry is
   * located at its key, a list item at its start. Data reached through an alias is located at
   * the entry that holds the alias.
   */
  locate(path: readonly PropertyKey[]): SourcePosition;
}

/** The result of reading a YAML file. */
export type YamlParseResult =
  | { readonly ok: true; readonly source: YamlSource }
  | { readonly ok: false; readonly problems: readonly ContentProblem[] };

/** Reads the text of a YAML file; `file` names it in problems. */
export function parseYaml(file: string, text: string): YamlParseResult {
  const lineCounter = new LineCounter();
  const document = parseDocument(text, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    prettyErrors: false,
    lineCounter,
  });
  const positionAt = (offset: number): SourcePosition => {
    const { line, col } = lineCounter.linePos(offset);
    return { line, column: col };
  };
  const problem = (offset: number, message: string): ContentProblem => ({
    file,
    ...positionAt(offset),
    path: "",
    message,
  });

  const parserProblems = [...document.errors, ...document.warnings].map((error) =>
    problem(error.pos[0], error.message),
  );
  if (parserProblems.length > 0) {
    return { ok: false, problems: parserProblems };
  }
  if (document.contents === null) {
    return { ok: false, problems: [problem(0, "the file is empty")] };
  }
  const aliasProblems: ContentProblem[] = [];
  visit(document, {
    Alias(_key, alias) {
      if (alias.resolve(document) === undefined) {
        aliasProblems.push(
          problem(
            offsetOf(alias),
            `the alias *${alias.source} has no anchor &${alias.source} before it`,
          ),
        );
      }
    },
  });
  if (aliasProblems.length > 0) {
    return { ok: false, problems: aliasProblems };
  }
  let value: unknown;
  try {
    value = document.toJS();
  } catch (error) {
    // The library refuses documents with too many aliases (a "billion laughs" file).
    return {
      ok: false,
      problems: [problem(0, error instanceof Error ? error.message : String(error))],
    };
  }
  return {
    ok: true,
    source: {
      file,
      value,
      locate: (path) => positionAt(locateOffset(document, path)),
    },
  };
}

/** Builds a problem for the data at `path` of a parsed file. */
export function sourceProblem(
  source: YamlSource,
  path: readonly PropertyKey[],
  message: string,
): ContentProblem {
  return {
    file: source.file,
    ...source.locate(path),
    path: formatDataPath(path),
    message,
  };
}

/**
 * Walks down the nodes along `path` as far as they go. A map entry is located at its key, a
 * list item at its start, the whole file at its first node.
 */
function locateOffset(document: Document, path: readonly PropertyKey[]): number {
  let node: unknown = document.contents;
  let offset = offsetOf(node);
  for (const segment of path) {
    if (isMap(node)) {
      const pair = node.items.find(
        (item) => isScalar(item.key) && String(item.key.value) === String(segment),
      );
      if (pair === undefined) {
        break;
      }
      offset = offsetOf(pair.key);
      node = pair.value;
    } else if (isSeq(node) && typeof segment === "number" && isNode(node.items[segment])) {
      node = node.items[segment];
      offset = offsetOf(node);
    } else {
      // A scalar, an alias or an empty value: the data behind it has no nodes of its own.
      break;
    }
  }
  return offset;
}

function offsetOf(node: unknown): number {
  return (isNode(node) ? node.range?.[0] : undefined) ?? 0;
}
