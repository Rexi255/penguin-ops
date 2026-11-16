// The documentation duty rule (ADR 0027, ADR 0036): a change that touches code or content must
// also change docs/STATUS.md. Pure: the caller collects the changed files and prints the result.

export const STATUS_FILE = "docs/STATUS.md";

/** Folders whose files are code or content (ADR 0006: workspaces, levels, tooling). */
const CODE_FOLDERS = ["apps/", "packages/", "content/", "scripts/"];

/**
 * Dependency manifests do not trigger the duty: Dependabot updates them in pull requests that
 * cannot update the status.
 */
const DEPENDENCY_MANIFESTS = new Set(["package.json", "package-lock.json"]);

/** Root files that are code: configurations of the toolchain written in TypeScript or JavaScript. */
const ROOT_CODE_FILE = /^(?:[^/]+\.(?:ts|tsx|js|mjs|cjs)|tsconfig(?:\.[^/]+)?\.json)$/;

/** Returns whether a repository path (forward slashes, as Git prints it) is code or content. */
export function isCodeOrContent(path: string): boolean {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  if (DEPENDENCY_MANIFESTS.has(fileName) || fileName.endsWith(".md")) {
    return false;
  }
  return CODE_FOLDERS.some((folder) => path.startsWith(folder)) || ROOT_CODE_FILE.test(path);
}

export interface DocumentationDutyResult {
  /** Changed files that are code or content, sorted. */
  readonly codeFiles: readonly string[];
  readonly statusChanged: boolean;
  readonly passed: boolean;
}

export function checkDocumentationDuty(changedFiles: readonly string[]): DocumentationDutyResult {
  const codeFiles = changedFiles.filter(isCodeOrContent).sort();
  const statusChanged = changedFiles.includes(STATUS_FILE);
  return { codeFiles, statusChanged, passed: codeFiles.length === 0 || statusChanged };
}

export function formatDocumentationDutyResult(result: DocumentationDutyResult): string[] {
  if (result.codeFiles.length === 0) {
    return ["Documentation duty check passed: no code or content changed."];
  }
  if (result.statusChanged) {
    return [
      `Documentation duty check passed: ${String(result.codeFiles.length)} code or content files and ${STATUS_FILE} changed.`,
    ];
  }
  return [
    `Documentation duty check failed: code or content changed, but ${STATUS_FILE} did not.`,
    ...result.codeFiles.map((file) => `  ${file}`),
    `Update ${STATUS_FILE} in the same change (CLAUDE.md, "Documentation duty").`,
  ];
}
