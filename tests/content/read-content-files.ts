// Reads the game's content folder for `loadContent` (ADR 0078): every file below `content/`,
// each with its path from the repository root and with forward slashes on every system, sorted
// by `sortContentFiles` of the content package (ADR 0090), which reports files that are not
// content.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  CONTENT_FOLDER,
  type ContentFile,
  type ContentFiles,
  formatProblem,
  sortContentFiles,
} from "@penguin-ops/content";

/** The files of the content folder, and the problems with files that are not content. */
export interface ContentFolder {
  readonly files: ContentFiles;
  /** Files that do not belong in the content folder, formatted like compiler messages. */
  readonly problems: readonly string[];
}

/** Reads every file of `<root>/content`. */
export function readContentFiles(root: string): ContentFolder {
  const folder = join(root, CONTENT_FOLDER);
  const files: ContentFile[] = readdirSync(folder, { recursive: true, encoding: "utf8" })
    .map((path) => path.split("\\").join("/"))
    .filter((path) => statSync(join(folder, path)).isFile())
    .map((path) => ({
      file: `${CONTENT_FOLDER}/${path}`,
      text: readFileSync(join(folder, path), "utf8"),
    }));
  const sorted = sortContentFiles(files);
  return { files: sorted.files, problems: sorted.problems.map(formatProblem) };
}
