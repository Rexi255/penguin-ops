// Loads the game's content from the text of its files (ADR 0070): `content/chapters.yaml` and
// every `content/levels/<level-id>/level.yaml`. Each file is checked with its schema, then the
// files are checked against each other: a level's folder name is its ID, every level that a
// chapter lists exists, and every level is in exactly one chapter. All problems of all files
// are reported together. Like the level loader, this module never reads files (ADR 0006).

import { type Chapter, chaptersSchema } from "./chapters-schema";
import { type ContentProblem, type LoadResult, sortProblems } from "./content-problem";
import { readYaml } from "./level-loader";
import { type Level, levelSchema } from "./level-schema";
import { sourceProblem, type YamlSource } from "./yaml-source";

/** A content file: its name and its text. */
export interface ContentFile {
  /**
   * The path from the repository root (or the content folder's parent) with forward slashes,
   * for example `content/levels/first-steps/level.yaml`. Problems repeat it.
   */
  readonly file: string;
  readonly text: string;
}

/** The files that `loadContent` reads. */
export interface ContentFiles {
  /** `content/chapters.yaml`. */
  readonly chapters: ContentFile;
  /** Every `content/levels/<level-id>/level.yaml`, in any order. */
  readonly levels: readonly ContentFile[];
}

/** The game's checked content. */
export interface Content {
  /** Chapters in order, each with its level IDs in order. */
  readonly chapters: readonly Chapter[];
  /** Every level by its ID, in the order of the chapters. */
  readonly levels: ReadonlyMap<string, Level>;
}

/** A level file and what reading it gave. */
interface LevelEntry {
  readonly file: string;
  /** The folder name, which must be the level's ID. */
  readonly folder: string;
  readonly level?: Level;
  readonly source?: YamlSource;
}

/** Folder and file name of a level file: `.../levels/<folder>/level.yaml`. */
const LEVEL_FILE_PATTERN = /(?:^|\/)levels\/([^/]+)\/level\.yaml$/u;

/** Reads and checks the chapters file and all level files (format: docs/LEVEL-AUTHORING.md). */
export function loadContent(files: ContentFiles): LoadResult<Content> {
  const problems: ContentProblem[] = [];

  const chapters = readYaml(chaptersSchema, files.chapters.file, files.chapters.text);
  if (!chapters.result.ok) {
    problems.push(...chapters.result.problems);
  }

  const levels = new Map<string, LevelEntry>();
  for (const { file, text } of files.levels) {
    const folder = LEVEL_FILE_PATTERN.exec(file)?.[1];
    if (folder === undefined) {
      problems.push(
        fileProblem(
          file,
          "a level file must be named level.yaml and lie in its own folder in the levels " +
            "folder, for example content/levels/first-steps/level.yaml",
        ),
      );
      continue;
    }
    const earlier = levels.get(folder);
    if (earlier !== undefined) {
      problems.push(fileProblem(file, `the level folder "${folder}" is given twice`));
      continue;
    }
    const { result, source } = readYaml(levelSchema, file, text);
    if (!result.ok) {
      problems.push(...result.problems);
    } else if (result.value.id !== folder) {
      problems.push(
        located(
          file,
          source,
          ["id"],
          `the level ID "${result.value.id}" must be the name of its folder "${folder}"`,
        ),
      );
    }
    levels.set(folder, {
      file,
      folder,
      ...(result.ok ? { level: result.value } : {}),
      ...(source === undefined ? {} : { source }),
    });
  }

  if (chapters.result.ok) {
    problems.push(
      ...chapterProblems(
        chapters.result.value.chapters,
        files.chapters.file,
        chapters.source,
        levels,
      ),
    );
  }

  if (problems.length > 0 || !chapters.result.ok) {
    return { ok: false, problems: sortProblems(problems) };
  }
  const ordered = new Map<string, Level>();
  for (const chapter of chapters.result.value.chapters) {
    for (const id of chapter.levels) {
      const level = levels.get(id)?.level;
      if (level !== undefined) {
        ordered.set(id, level);
      }
    }
  }
  return { ok: true, value: { chapters: chapters.result.value.chapters, levels: ordered } };
}

/**
 * Checks the chapters against the level folders: every listed level exists, no level is
 * listed twice, every level is listed.
 */
function chapterProblems(
  chapters: readonly Chapter[],
  chaptersFile: string,
  chaptersSource: YamlSource | undefined,
  levels: ReadonlyMap<string, LevelEntry>,
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const chapterOf = new Map<string, string>();
  chapters.forEach((chapter, chapterIndex) => {
    chapter.levels.forEach((id, levelIndex) => {
      const path = ["chapters", chapterIndex, "levels", levelIndex];
      const earlier = chapterOf.get(id);
      if (earlier !== undefined) {
        problems.push(
          located(
            chaptersFile,
            chaptersSource,
            path,
            `the level "${id}" is already in chapter "${earlier}"`,
          ),
        );
        return;
      }
      chapterOf.set(id, chapter.id);
      if (!levels.has(id)) {
        problems.push(
          located(
            chaptersFile,
            chaptersSource,
            path,
            `there is no level "${id}" (no file levels/${id}/level.yaml)`,
          ),
        );
      }
    });
  });
  for (const entry of levels.values()) {
    if (!chapterOf.has(entry.folder)) {
      problems.push(
        located(entry.file, entry.source, ["id"], `the level is in no chapter of ${chaptersFile}`),
      );
    }
  }
  return problems;
}

/** A problem at the data at `path`, or at the file's start if the file could not be read. */
function located(
  file: string,
  source: YamlSource | undefined,
  path: readonly PropertyKey[],
  message: string,
): ContentProblem {
  return source === undefined ? fileProblem(file, message) : sourceProblem(source, path, message);
}

/** A problem with a whole file, located at its start. */
function fileProblem(file: string, message: string): ContentProblem {
  return { file, line: 1, column: 1, path: "", message };
}
