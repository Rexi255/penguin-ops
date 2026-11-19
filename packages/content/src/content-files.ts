// Sorts the files of the content folder into the inputs of `loadContent` (ADR 0078, ADR 0090):
// `content/chapters.yaml`, the files of every level folder, the UI catalogs and the base worlds.
// Any other file is reported, so that a misplaced file is not silently ignored; the generated
// JSON Schemas in `content/schemas/` are not content and are skipped. The callers read the files
// (the content tests from disk, the app from its bundle); this module never reads files
// (ADR 0006).

import type { ContentFile, ContentFiles } from "./content-loader";
import { type ContentProblem, sortProblems } from "./content-problem";

/** The name of the content folder; every file path starts with it. */
export const CONTENT_FOLDER = "content";

/** The content files sorted for `loadContent`, and the files that are not content. */
export interface SortedContentFiles {
  readonly files: ContentFiles;
  readonly problems: readonly ContentProblem[];
}

/** Where a file of the content folder goes, by its path inside the folder. */
type FileKind = "chapters" | "level" | "level-catalog" | "ui-catalog" | "world" | "schema";

const KINDS: readonly (readonly [RegExp, FileKind])[] = [
  [/^chapters\.yaml$/u, "chapters"],
  [/^levels\/[^/]+\/level\.yaml$/u, "level"],
  [/^levels\/[^/]+\/[^/]+\.yaml$/u, "level-catalog"],
  [/^ui\/[^/]+\.yaml$/u, "ui-catalog"],
  [/^worlds\/[^/]+\.yaml$/u, "world"],
  [/^schemas\/[^/]+\.schema\.json$/u, "schema"],
];

const NOT_CONTENT =
  "not a content file: content/ holds chapters.yaml, levels/<level-id>/*.yaml, ui/*.yaml, " +
  "worlds/*.yaml and the generated schemas/*.schema.json";

/** A problem with a whole file, reported at its start. */
function fileProblem(file: string, message: string): ContentProblem {
  return { file, line: 1, column: 1, path: "", message };
}

/**
 * Sorts content files by their path, which starts with `content/` and uses forward slashes on
 * every system. Each list keeps the order of the paths. A missing `chapters.yaml` is reported
 * and given as an empty file.
 */
export function sortContentFiles(files: readonly ContentFile[]): SortedContentFiles {
  const problems: ContentProblem[] = [];
  let chapters: ContentFile | undefined;
  const levels: ContentFile[] = [];
  const levelCatalogs: ContentFile[] = [];
  const uiCatalogs: ContentFile[] = [];
  const worlds: ContentFile[] = [];
  const prefix = `${CONTENT_FOLDER}/`;
  for (const content of [...files].sort((a, b) => compareText(a.file, b.file))) {
    const path = content.file.startsWith(prefix) ? content.file.slice(prefix.length) : undefined;
    const kind =
      path === undefined ? undefined : KINDS.find(([pattern]) => pattern.test(path))?.[1];
    if (kind === undefined) {
      problems.push(fileProblem(content.file, NOT_CONTENT));
      continue;
    }
    switch (kind) {
      case "chapters":
        chapters = content;
        break;
      case "level":
        levels.push(content);
        break;
      case "level-catalog":
        levelCatalogs.push(content);
        break;
      case "ui-catalog":
        uiCatalogs.push(content);
        break;
      case "world":
        worlds.push(content);
        break;
      case "schema":
        break;
    }
  }
  const chaptersFile = `${CONTENT_FOLDER}/chapters.yaml`;
  if (chapters === undefined) {
    problems.push(fileProblem(chaptersFile, "the chapters file is missing"));
  }
  return {
    files: {
      chapters: chapters ?? { file: chaptersFile, text: "" },
      levels,
      levelCatalogs,
      uiCatalogs,
      worlds,
    },
    problems: sortProblems(problems),
  };
}

/** Compares by UTF-16 code units, the same on every system and locale. */
function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
