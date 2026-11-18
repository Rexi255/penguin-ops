// Reads the game's content folder for `loadContent` (ADR 0078): `content/chapters.yaml`, the
// files of every level folder, the UI catalogs and the base worlds, each with its path from the
// repository root and with forward slashes on every system. Any other file in the folder is
// reported, so that a misplaced file is not silently ignored. The generated JSON Schemas in
// `content/schemas/` are not content.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ContentFile, ContentFiles } from "@penguin-ops/content";

/** The name of the content folder in the repository. */
const CONTENT_FOLDER = "content";

/** The files of the content folder, and the problems with files that are not content. */
export interface ContentFolder {
  readonly files: ContentFiles;
  /** Files that do not belong in the content folder, as `path: message`. */
  readonly problems: readonly string[];
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

/**
 * Reads every file of `<root>/content`, sorted by path. A missing `chapters.yaml` is reported
 * and given as an empty file.
 */
export function readContentFiles(root: string): ContentFolder {
  const folder = join(root, CONTENT_FOLDER);
  const paths = readdirSync(folder, { recursive: true, encoding: "utf8" })
    .map((path) => path.split("\\").join("/"))
    .filter((path) => statSync(join(folder, path)).isFile())
    .sort();
  const problems: string[] = [];
  let chapters: ContentFile | undefined;
  const levels: ContentFile[] = [];
  const levelCatalogs: ContentFile[] = [];
  const uiCatalogs: ContentFile[] = [];
  const worlds: ContentFile[] = [];
  for (const path of paths) {
    const file = `${CONTENT_FOLDER}/${path}`;
    const kind = KINDS.find(([pattern]) => pattern.test(path))?.[1];
    if (kind === undefined) {
      problems.push(
        `${file}: not a content file: content/ holds chapters.yaml, levels/<level-id>/*.yaml, ` +
          "ui/*.yaml, worlds/*.yaml and the generated schemas/*.schema.json",
      );
      continue;
    }
    if (kind === "schema") {
      continue;
    }
    const content: ContentFile = { file, text: readFileSync(join(folder, path), "utf8") };
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
    }
  }
  if (chapters === undefined) {
    problems.push(`${CONTENT_FOLDER}/chapters.yaml: the chapters file is missing`);
  }
  return {
    files: {
      chapters: chapters ?? { file: `${CONTENT_FOLDER}/chapters.yaml`, text: "" },
      levels,
      levelCatalogs,
      uiCatalogs,
      worlds,
    },
    problems,
  };
}
