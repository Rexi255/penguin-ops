// Problems found while loading content files (ADR 0069): each names the file, the line and the
// column, so that level authors can jump to the spot, and the path inside the file's data.

/** A problem in a content file. */
export interface ContentProblem {
  /** The file as the caller named it, for example `content/levels/first-steps/level.yaml`. */
  readonly file: string;
  /** Line, starting at 1. */
  readonly line: number;
  /** Column in UTF-16 code units like editors count them, starting at 1. */
  readonly column: number;
  /** Where in the file's data, for example `start.files["~/a"]`; empty for the whole file. */
  readonly path: string;
  readonly message: string;
}

/** The result of loading a content file: its value or at least one problem. */
export type LoadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly ContentProblem[] };

/** Formats a problem like compilers do: `file:line:column: path: message`. */
export function formatProblem(problem: ContentProblem): string {
  const where = problem.path === "" ? "" : `${problem.path}: `;
  return `${problem.file}:${String(problem.line)}:${String(problem.column)}: ${where}${problem.message}`;
}

/** Writes a path into a file's data like JavaScript would: `tips[0].say`, `files["~/a"]`. */
export function formatDataPath(path: readonly PropertyKey[]): string {
  let text = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      text += `[${String(segment)}]`;
    } else {
      const key = String(segment);
      text += /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)
        ? `${text === "" ? "" : "."}${key}`
        : `[${JSON.stringify(key)}]`;
    }
  }
  return text;
}

/** Sorts problems by file, line and column, and removes repeated ones. */
export function sortProblems(problems: readonly ContentProblem[]): ContentProblem[] {
  const seen = new Set<string>();
  return [...problems]
    .sort(
      (a, b) =>
        compareText(a.file, b.file) ||
        a.line - b.line ||
        a.column - b.column ||
        compareText(a.path, b.path) ||
        compareText(a.message, b.message),
    )
    .filter((problem) => {
      const key = formatProblem(problem);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

/** Compares by UTF-16 code units, so that the order does not depend on a locale. */
function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
