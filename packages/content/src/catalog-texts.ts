// Checks the texts of a loaded catalog (ADR 0072): every text that the game formats must be a
// valid message (code spans, ICU MessageFormat). Some catalog texts are literal and never
// formatted: the commands of an explanation (`example`, the option of each `options` row) and
// the prose file contents that level.yaml references with `{ text: <key> }`, which become the
// content of a file in the simulated world.

import type { LevelCatalog, PartialLevelCatalog, UiCatalog } from "./catalog-schema";
import { type ContentProblem, formatDataPath } from "./content-problem";
import type { Level } from "./level-schema";
import { checkMessage, type MessageRules } from "./message";
import type { YamlSource } from "./yaml-source";

/** A text that the game formats, and where it is in the catalog. */
interface MessageEntry {
  readonly path: readonly PropertyKey[];
  readonly text: string;
}

/** The game passes no values to level texts. */
const LEVEL_TEXT_RULES: MessageRules = { placeholders: false };

/** UI texts may have placeholders; which values the UI passes is checked with the UI. */
const UI_TEXT_RULES: MessageRules = { placeholders: true };

/** The text keys that a level uses for the content of start files. */
export function fileTextKeys(level: Level): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const entry of level.start.files) {
    if (entry.kind === "file" && entry.source.kind === "text") {
      keys.add(entry.source.key);
    }
  }
  return keys;
}

/**
 * Problems of the messages of a level catalog. Free texts are checked only when the level is
 * known, because only level.yaml tells which of them are file contents; without a valid level
 * its own problems are reported instead.
 */
export function levelCatalogTextProblems(
  source: YamlSource,
  catalog: LevelCatalog | PartialLevelCatalog,
  language: string,
  level: Level | undefined,
): ContentProblem[] {
  const entries: MessageEntry[] = [];
  const add = (path: readonly PropertyKey[], text: string | undefined): void => {
    if (text !== undefined) {
      entries.push({ path, text });
    }
  };
  add(["title"], catalog.title);
  add(["ticket"], catalog.ticket);
  catalog.hints?.forEach((hint, index) => {
    add(["hints", index], hint);
  });
  add(["explanation", "text"], catalog.explanation?.text);
  catalog.explanation?.options?.forEach(([, description], index) => {
    add(["explanation", "options", index, 1], description);
  });
  for (const [id, text] of catalog.extraGoals) {
    add(["extra_goals", id], text);
  }
  if (level !== undefined) {
    const files = fileTextKeys(level);
    for (const [key, text] of catalog.texts) {
      if (!files.has(key)) {
        add([key], text);
      }
    }
  }
  return entries.flatMap((entry) => messageProblems(source, entry, language, LEVEL_TEXT_RULES));
}

/** Problems of the messages of a UI catalog. */
export function uiCatalogTextProblems(
  source: YamlSource,
  catalog: UiCatalog,
  language: string,
): ContentProblem[] {
  return [...catalog].flatMap(([key, text]) =>
    messageProblems(source, { path: key.split("."), text }, language, UI_TEXT_RULES),
  );
}

function messageProblems(
  source: YamlSource,
  { path, text }: MessageEntry,
  language: string,
  rules: MessageRules,
): ContentProblem[] {
  return checkMessage(text, language, rules).map((problem) => ({
    file: source.file,
    ...source.locateInText(path, problem.offset),
    path: formatDataPath(path),
    message: problem.message,
  }));
}
