// Loads the game's content from the text of its files (ADR 0070, ADR 0071, ADR 0076):
// `content/chapters.yaml`, every `content/levels/<level-id>/level.yaml` with the level's text
// catalogs `<language>.yaml` next to it, the base worlds `content/worlds/<world-id>.yaml` and
// the UI catalogs `content/ui/<language>.yaml`. Each file is checked with its schema, then the
// files are checked against each other: a level's folder name is its ID, every level that a
// chapter lists exists, every level is in exactly one chapter, every catalog belongs to a level,
// the English and German catalogs exist, a world's file name is its ID, and a level's world,
// start host and the owners and groups of its start files exist. All problems of all files are reported together. Like the level loader, this module
// never reads files (ADR 0006).

import type { z } from "zod";

import {
  type Catalogs,
  isMandatoryLanguage,
  LANGUAGE_NAMES,
  LANGUAGE_PATTERN,
  type LevelCatalog,
  levelCatalogSchema,
  MANDATORY_LANGUAGES,
  type MandatoryLanguage,
  type PartialLevelCatalog,
  partialLevelCatalogSchema,
  type UiCatalog,
  uiCatalogSchema,
} from "./catalog-schema";
import {
  type CheckedCatalog,
  type CheckedCatalogs,
  levelCompletenessProblems,
  uiCompletenessProblems,
} from "./catalog-completeness";
import { levelCatalogTextProblems, uiCatalogTextProblems } from "./catalog-texts";
import { type Chapter, chaptersSchema } from "./chapters-schema";
import { type ContentProblem, type LoadResult, sortProblems } from "./content-problem";
import { readYaml } from "./level-loader";
import { type Level, levelSchema } from "./level-schema";
import { type BaseWorld, baseWorldSchema, DEFAULT_WORLD_ID } from "./world-schema";
import { textLocale } from "./message";
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
  /**
   * Every other `.yaml` file in a level folder, in any order: the level's text catalogs
   * `content/levels/<level-id>/<language>.yaml`. Pass all of them, so that a misnamed file
   * is reported instead of ignored.
   */
  readonly levelCatalogs: readonly ContentFile[];
  /** Every `.yaml` file in `content/ui/`: the UI catalogs `content/ui/<language>.yaml`. */
  readonly uiCatalogs: readonly ContentFile[];
  /** Every `.yaml` file in `content/worlds/`: the base worlds `<world-id>.yaml`. */
  readonly worlds: readonly ContentFile[];
}

/** The text catalogs of a level. */
export type LevelCatalogs = Catalogs<LevelCatalog, PartialLevelCatalog>;

/** The UI catalogs. */
export type UiCatalogs = Catalogs<UiCatalog, UiCatalog>;

/** The game's checked content. */
export interface Content {
  /** Chapters in order, each with its level IDs in order. */
  readonly chapters: readonly Chapter[];
  /** Every level by its ID, in the order of the chapters. */
  readonly levels: ReadonlyMap<string, Level>;
  /** The text catalogs of every level by the level's ID, in the order of the chapters. */
  readonly levelCatalogs: ReadonlyMap<string, LevelCatalogs>;
  /** The general UI texts. */
  readonly uiCatalogs: UiCatalogs;
  /** Every base world by its ID, in the order of the files given. */
  readonly worlds: ReadonlyMap<string, BaseWorld>;
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

/** Folder and name of a level catalog: `.../levels/<folder>/<name>.yaml`. */
const LEVEL_CATALOG_FILE_PATTERN = /(?:^|\/)levels\/([^/]+)\/([^/]+)\.yaml$/u;

/** Name of a UI catalog: `.../ui/<name>.yaml`. */
const UI_CATALOG_FILE_PATTERN = /(?:^|\/)ui\/([^/]+)\.yaml$/u;

/** Name of a world file: `.../worlds/<name>.yaml`. */
const WORLD_FILE_PATTERN = /(?:^|\/)worlds\/([^/]+)\.yaml$/u;

/**
 * Reads and checks the chapters file, all level files and all catalogs (format:
 * docs/LEVEL-AUTHORING.md).
 */
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

  const levelCatalogs = readLevelCatalogs(files.levelCatalogs, levels, problems);
  const uiCatalogs = readUiCatalogs(files.uiCatalogs, files.chapters.file, problems);
  const worlds = readWorlds(files.worlds, problems);
  problems.push(...levelWorldProblems(levels, worlds, files.chapters.file));

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

  if (problems.length > 0 || !chapters.result.ok || uiCatalogs === undefined) {
    return { ok: false, problems: sortProblems(problems) };
  }
  const orderedLevels = new Map<string, Level>();
  const orderedCatalogs = new Map<string, LevelCatalogs>();
  for (const chapter of chapters.result.value.chapters) {
    for (const id of chapter.levels) {
      const level = levels.get(id)?.level;
      const catalogs = levelCatalogs.get(id);
      if (level !== undefined && catalogs !== undefined) {
        orderedLevels.set(id, level);
        orderedCatalogs.set(id, catalogs);
      }
    }
  }
  return {
    ok: true,
    value: {
      chapters: chapters.result.value.chapters,
      levels: orderedLevels,
      levelCatalogs: orderedCatalogs,
      uiCatalogs,
      worlds: validWorlds(worlds),
    },
  };
}

/** A world file and what reading it gave. */
interface WorldEntry {
  readonly file: string;
  /** The world, if the file is valid. */
  readonly world?: BaseWorld;
}

/**
 * Reads the world files: each lies in a `worlds` folder, its name is the world's ID, and each
 * name is given once. Returns every world file by its name, also those with problems, so that
 * the levels that use a broken world are not reported as well.
 */
function readWorlds(
  files: readonly ContentFile[],
  problems: ContentProblem[],
): Map<string, WorldEntry> {
  const worlds = new Map<string, WorldEntry>();
  for (const { file, text } of files) {
    const name = WORLD_FILE_PATTERN.exec(file)?.[1];
    if (name === undefined) {
      problems.push(
        fileProblem(
          file,
          "a world file must lie in the worlds folder, for example content/worlds/office.yaml",
        ),
      );
      continue;
    }
    if (worlds.has(name)) {
      problems.push(fileProblem(file, `the world file "${name}.yaml" is given twice`));
      continue;
    }
    const { result, source } = readYaml(baseWorldSchema, file, text);
    if (!result.ok) {
      problems.push(...result.problems);
      worlds.set(name, { file });
    } else if (result.value.id !== name) {
      problems.push(
        located(
          file,
          source,
          ["id"],
          `the world ID "${result.value.id}" must be the name of its file "${name}.yaml"`,
        ),
      );
      worlds.set(name, { file });
    } else {
      worlds.set(name, { file, world: result.value });
    }
  }
  return worlds;
}

/** The valid worlds by their IDs. */
function validWorlds(worlds: ReadonlyMap<string, WorldEntry>): Map<string, BaseWorld> {
  const valid = new Map<string, BaseWorld>();
  for (const [id, { world }] of worlds) {
    if (world !== undefined) {
      valid.set(id, world);
    }
  }
  return valid;
}

/**
 * Checks every valid level against its world: the world exists, the start host is one of its
 * hosts, and the owners and groups of the start files are users and groups of the start host.
 * The player's own account cannot be named (ADR 0019); files in `~` belong to the player by
 * default. A level whose world file has problems is not checked.
 */
function levelWorldProblems(
  levels: ReadonlyMap<string, LevelEntry>,
  worlds: ReadonlyMap<string, WorldEntry>,
  chaptersFile: string,
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const folder = chaptersFile.slice(0, chaptersFile.lastIndexOf("/") + 1);
  for (const { file, level, source } of levels.values()) {
    if (level === undefined) {
      continue;
    }
    const id = level.world ?? DEFAULT_WORLD_ID;
    const entry = worlds.get(id);
    if (entry === undefined) {
      problems.push(
        level.world === undefined
          ? located(
              file,
              source,
              ["id"],
              `the level uses the standard world "${id}", which does not exist (no file ${folder}worlds/${id}.yaml)`,
            )
          : located(
              file,
              source,
              ["world"],
              `there is no world "${id}" (no file ${folder}worlds/${id}.yaml)`,
            ),
      );
      continue;
    }
    if (entry.world !== undefined) {
      problems.push(...startProblems(file, source, level, entry.world));
    }
  }
  return problems;
}

/** Checks the start host and the owners and groups of the start files of a level. */
function startProblems(
  file: string,
  source: YamlSource | undefined,
  level: Level,
  world: BaseWorld,
): ContentProblem[] {
  const hostName = level.start.host;
  const host =
    hostName === undefined
      ? world.hosts[0]
      : world.hosts.find((candidate) => candidate.name === hostName);
  if (host === undefined) {
    return [
      located(
        file,
        source,
        ["start", "host"],
        `the world "${world.id}" has no host "${hostName ?? ""}"`,
      ),
    ];
  }
  const problems: ContentProblem[] = [];
  const users = new Set(host.users.map((user) => user.name));
  const groups = new Set(host.groups.map((group) => group.name));
  for (const entry of level.start.files) {
    const path = ["start", "files", entry.kind === "directory" ? `${entry.path}/` : entry.path];
    if (entry.owner !== undefined && !users.has(entry.owner)) {
      problems.push(
        located(
          file,
          source,
          path,
          `the owner "${entry.owner}" is no user of the host "${host.name}"`,
        ),
      );
    }
    if (entry.group !== undefined && !groups.has(entry.group)) {
      problems.push(
        located(
          file,
          source,
          path,
          `the group "${entry.group}" is no group of the host "${host.name}"`,
        ),
      );
    }
  }
  return problems;
}

/** The catalogs read for one level or for the UI. */
interface CatalogsRead<Complete, Partial> {
  readonly mandatory: Map<MandatoryLanguage, Complete>;
  readonly extra: Map<string, Partial>;
  /** The sources of the valid catalogs by language, for checks across files. */
  readonly sources: Map<string, YamlSource>;
  /** Every language given, also those whose file has problems. */
  readonly given: Set<string>;
}

function emptyCatalogsRead<Complete, Partial>(): CatalogsRead<Complete, Partial> {
  return { mandatory: new Map(), extra: new Map(), sources: new Map(), given: new Set() };
}

/**
 * Reads the level catalogs and checks them against the level folders: each lies in the folder
 * of an existing level, is named after its language and is given once; every level has an
 * English and a German catalog. Returns the catalogs of every level whose mandatory catalogs
 * are valid.
 */
function readLevelCatalogs(
  files: readonly ContentFile[],
  levels: ReadonlyMap<string, LevelEntry>,
  problems: ContentProblem[],
): Map<string, LevelCatalogs> {
  const read = new Map<string, CatalogsRead<LevelCatalog, PartialLevelCatalog>>();
  for (const { file, text } of files) {
    const match = LEVEL_CATALOG_FILE_PATTERN.exec(file);
    const folder = match?.[1];
    const language = match?.[2];
    if (folder === undefined || language === undefined) {
      problems.push(
        fileProblem(
          file,
          "a level catalog must lie in the folder of its level, for example " +
            "content/levels/first-steps/de.yaml",
        ),
      );
      continue;
    }
    if (!levels.has(folder)) {
      problems.push(
        fileProblem(
          file,
          `there is no level "${folder}" for this catalog (no file levels/${folder}/level.yaml)`,
        ),
      );
      continue;
    }
    const catalogs = read.get(folder) ?? emptyCatalogsRead();
    read.set(folder, catalogs);
    const level = levels.get(folder)?.level;
    readCatalog(catalogs, { file, text }, language, problems, {
      complete: levelCatalogSchema,
      partial: partialLevelCatalogSchema,
      twice: `the ${language} catalog of the level "${folder}" is given twice`,
      checkTexts: (catalog, source) => levelCatalogTextProblems(source, catalog, language, level),
    });
  }

  const complete = new Map<string, LevelCatalogs>();
  for (const entry of levels.values()) {
    const catalogs = read.get(entry.folder) ?? emptyCatalogsRead();
    for (const language of missingLanguages(catalogs)) {
      problems.push(
        fileProblem(
          entry.file.replace(/level\.yaml$/u, `${language}.yaml`),
          `the ${LANGUAGE_NAMES[language]} catalog is missing: every level needs ` +
            MANDATORY_LANGUAGES.map((code) => `${code}.yaml`).join(" and "),
        ),
      );
    }
    if (entry.level !== undefined && entry.source !== undefined) {
      problems.push(
        ...levelCompletenessProblems(entry.level, entry.source, checkedCatalogs(catalogs)),
      );
    }
    const built = toCatalogs(catalogs);
    if (built !== undefined) {
      complete.set(entry.folder, built);
    }
  }
  return complete;
}

/**
 * Reads the UI catalogs: each lies in a `ui` folder, is named after its language and is given
 * once; English and German exist. A missing one is reported at the file where it belongs, in
 * the folder of `chaptersFile`. Returns `undefined` if a mandatory catalog is missing or broken.
 */
function readUiCatalogs(
  files: readonly ContentFile[],
  chaptersFile: string,
  problems: ContentProblem[],
): UiCatalogs | undefined {
  const catalogs = emptyCatalogsRead<UiCatalog, UiCatalog>();
  for (const { file, text } of files) {
    const language = UI_CATALOG_FILE_PATTERN.exec(file)?.[1];
    if (language === undefined) {
      problems.push(
        fileProblem(file, "a UI catalog must lie in the ui folder, for example content/ui/de.yaml"),
      );
      continue;
    }
    readCatalog(catalogs, { file, text }, language, problems, {
      complete: uiCatalogSchema,
      partial: uiCatalogSchema,
      twice: `the ${language} UI catalog is given twice`,
      checkTexts: (catalog, source) => uiCatalogTextProblems(source, catalog, language),
    });
  }
  const folder = chaptersFile.slice(0, chaptersFile.lastIndexOf("/") + 1);
  for (const language of missingLanguages(catalogs)) {
    problems.push(
      fileProblem(
        `${folder}ui/${language}.yaml`,
        `the ${LANGUAGE_NAMES[language]} UI catalog is missing: the game needs ` +
          MANDATORY_LANGUAGES.map((code) => `ui/${code}.yaml`).join(" and "),
      ),
    );
  }
  problems.push(...uiCompletenessProblems(checkedCatalogs(catalogs)));
  return toCatalogs(catalogs);
}

/** The valid catalogs read, with their sources, for the completeness checks. */
function checkedCatalogs<Complete, Partial>(
  catalogs: CatalogsRead<Complete, Partial>,
): CheckedCatalogs<Complete, Partial> {
  const checked = <T>(language: string, value: T | undefined): CheckedCatalog<T>[] => {
    const source = catalogs.sources.get(language);
    return value === undefined || source === undefined ? [] : [{ language, value, source }];
  };
  const [en] = checked("en", catalogs.mandatory.get("en"));
  const [de] = checked("de", catalogs.mandatory.get("de"));
  return {
    ...(en === undefined ? {} : { en }),
    ...(de === undefined ? {} : { de }),
    extra: [...catalogs.extra].flatMap(([language, value]) => checked(language, value)),
  };
}

/** How to read the catalogs of one kind. */
interface CatalogKind<Complete, Partial> {
  /** Schema of an English or German catalog. */
  readonly complete: z.ZodType<Complete>;
  /** Schema of a catalog of a further language. */
  readonly partial: z.ZodType<Partial>;
  /** The problem of a language given twice. */
  readonly twice: string;
  /** Checks the texts of a catalog that passed its schema (ICU MessageFormat, markup). */
  readonly checkTexts: (catalog: Complete | Partial, source: YamlSource) => ContentProblem[];
}

/** Reads one catalog file into `catalogs`, after checking its name and that it is new. */
function readCatalog<Complete, Partial>(
  catalogs: CatalogsRead<Complete, Partial>,
  { file, text }: ContentFile,
  language: string,
  problems: ContentProblem[],
  kind: CatalogKind<Complete, Partial>,
): void {
  if (!LANGUAGE_PATTERN.test(language)) {
    problems.push(
      fileProblem(
        file,
        `"${language}.yaml" is not named after a language: a catalog is named after its ` +
          "language code, for example de.yaml, en.yaml or pt-br.yaml",
      ),
    );
    return;
  }
  if (catalogs.given.has(language)) {
    problems.push(fileProblem(file, kind.twice));
    return;
  }
  catalogs.given.add(language);
  if (textLocale(language) === undefined) {
    problems.push(
      fileProblem(
        file,
        `"${language}" is not a language that the game can format texts in (plurals and ` +
          "numbers): use an ISO 639 language code",
      ),
    );
    return;
  }
  if (isMandatoryLanguage(language)) {
    const read = readCatalogFile(kind.complete, kind.checkTexts, { file, text }, problems);
    if (read !== undefined) {
      catalogs.mandatory.set(language, read.value);
      catalogs.sources.set(language, read.source);
    }
  } else {
    const read = readCatalogFile(kind.partial, kind.checkTexts, { file, text }, problems);
    if (read !== undefined) {
      catalogs.extra.set(language, read.value);
      catalogs.sources.set(language, read.source);
    }
  }
}

/**
 * Reads a catalog file with a schema and checks its texts; returns it and its source if it has
 * no problems.
 */
function readCatalogFile<T>(
  schema: z.ZodType<T>,
  checkTexts: (catalog: T, source: YamlSource) => ContentProblem[],
  { file, text }: ContentFile,
  problems: ContentProblem[],
): { readonly value: T; readonly source: YamlSource } | undefined {
  const { result, source } = readYaml(schema, file, text);
  if (!result.ok || source === undefined) {
    problems.push(...(result.ok ? [] : result.problems));
    return undefined;
  }
  const textProblems = checkTexts(result.value, source);
  problems.push(...textProblems);
  return textProblems.length === 0 ? { value: result.value, source } : undefined;
}

/** The mandatory languages without a catalog file. */
function missingLanguages(catalogs: CatalogsRead<unknown, unknown>): MandatoryLanguage[] {
  return MANDATORY_LANGUAGES.filter((language) => !catalogs.given.has(language));
}

/** The catalogs read, or `undefined` if a mandatory one is missing or broken. */
function toCatalogs<Complete, Partial>(
  catalogs: CatalogsRead<Complete, Partial>,
): Catalogs<Complete, Partial> | undefined {
  const en = catalogs.mandatory.get("en");
  const de = catalogs.mandatory.get("de");
  return en === undefined || de === undefined ? undefined : { en, de, extra: catalogs.extra };
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
