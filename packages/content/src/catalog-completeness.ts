// Completeness of the catalogs (ADR 0012, ADR 0075): the catalogs hold exactly the texts that
// the level or the game needs, and the languages agree with English.
//
// - English and German level catalogs hold every text key that level.yaml uses (tips, step
//   messages, prose file contents) and a description of every extra goal; every catalog of a
//   level holds no other free texts or extra goals.
// - A text key is used either for file contents or as a message, not both, because file
//   contents are literal (ADR 0072).
// - The commands of an explanation (options and example) are the same in every language as in
//   English: they are technical and always English.
// - The German UI catalog has exactly the keys of the English one; further languages have no
//   keys that English lacks.
// - A UI text uses the same placeholders, in the same way, in every language.
//
// Missing texts of further languages are not problems; they fall back to English (ADR 0074).

import type { LevelCatalog, PartialLevelCatalog, UiCatalog } from "./catalog-schema";
import type { ContentProblem } from "./content-problem";
import type { Level } from "./level-schema";
import { messagePlaceholders, type PlaceholderUse } from "./message";
import { sourceProblem, type YamlSource } from "./yaml-source";

/** A catalog that passed its schema and text checks, with its source. */
export interface CheckedCatalog<T> {
  readonly language: string;
  readonly value: T;
  readonly source: YamlSource;
}

/** The valid catalogs of a level or of the UI. */
export interface CheckedCatalogs<Complete, Partial> {
  readonly en?: CheckedCatalog<Complete>;
  readonly de?: CheckedCatalog<Complete>;
  readonly extra: readonly CheckedCatalog<Partial>[];
}

/** Where level.yaml uses a text key, and how. */
interface TextUse {
  readonly path: readonly PropertyKey[];
  readonly kind: "file" | "message";
}

/** The text keys that a level uses, each with its uses in the order of the file. */
function textUses(level: Level): Map<string, TextUse[]> {
  const uses = new Map<string, TextUse[]>();
  const add = (key: string, use: TextUse): void => {
    uses.set(key, [...(uses.get(key) ?? []), use]);
  };
  for (const entry of level.start.files) {
    if (entry.kind === "file" && entry.source.kind === "text") {
      add(entry.source.key, { path: ["start", "files", entry.path, "text"], kind: "file" });
    }
  }
  level.steps?.forEach((step, index) => {
    if (step.say !== undefined) {
      add(step.say, { path: ["steps", index, "say"], kind: "message" });
    }
  });
  level.tips.forEach((tip, index) => {
    add(tip.say, { path: ["tips", index, "say"], kind: "message" });
  });
  return uses;
}

/** Problems of a level's catalogs against its level file and against English. */
export function levelCompletenessProblems(
  level: Level,
  levelSource: YamlSource,
  catalogs: CheckedCatalogs<LevelCatalog, PartialLevelCatalog>,
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const uses = textUses(level);
  for (const [key, keyUses] of uses) {
    const file = keyUses.find((use) => use.kind === "file");
    if (file === undefined) {
      continue;
    }
    for (const use of keyUses.filter((other) => other.kind === "message")) {
      problems.push(
        sourceProblem(
          levelSource,
          use.path,
          `the text "${key}" is the content of a file (start.files), so it cannot also be a ` +
            "message: file contents are not formatted",
        ),
      );
    }
  }
  const extraGoals = new Set(level.extraGoals.map((goal) => goal.id));

  for (const catalog of [catalogs.en, catalogs.de]) {
    if (catalog === undefined) {
      continue;
    }
    for (const key of uses.keys()) {
      if (!catalog.value.texts.has(key)) {
        problems.push(
          sourceProblem(catalog.source, [], `the text "${key}" is missing: level.yaml uses it`),
        );
      }
    }
    for (const id of extraGoals) {
      if (!catalog.value.extraGoals.has(id)) {
        problems.push(
          sourceProblem(
            catalog.source,
            [],
            `the description extra_goals.${id} is missing: level.yaml has the extra goal "${id}"`,
          ),
        );
      }
    }
  }

  const all = [
    ...(catalogs.en === undefined ? [] : [catalogs.en]),
    ...(catalogs.de === undefined ? [] : [catalogs.de]),
    ...catalogs.extra,
  ];
  for (const catalog of all) {
    for (const key of catalog.value.texts.keys()) {
      if (!uses.has(key)) {
        problems.push(
          sourceProblem(catalog.source, [key], `level.yaml does not use the text "${key}"`),
        );
      }
    }
    for (const id of catalog.value.extraGoals.keys()) {
      if (!extraGoals.has(id)) {
        problems.push(
          sourceProblem(
            catalog.source,
            ["extra_goals", id],
            `level.yaml has no extra goal "${id}"`,
          ),
        );
      }
    }
  }

  const english = catalogs.en?.value.explanation;
  if (english !== undefined) {
    if (catalogs.de !== undefined) {
      problems.push(...commandProblems(english, catalogs.de, true));
    }
    for (const catalog of catalogs.extra) {
      problems.push(...commandProblems(english, catalog, false));
    }
  }
  return problems;
}

/**
 * Problems of the explanation's commands of a translation against English. German must have
 * the same options and example as English. A further language may leave them out (they fall
 * back to English) or give no options (ADR 0074); options and an example that it gives must be
 * those of English.
 */
function commandProblems(
  english: LevelCatalog["explanation"],
  catalog: CheckedCatalog<LevelCatalog | PartialLevelCatalog>,
  complete: boolean,
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const explanation = catalog.value.explanation;
  const englishOptions = english.options.map(([option]) => option);
  const options = explanation?.options?.map(([option]) => option);
  const optionsDiffer =
    options !== undefined &&
    (complete || options.length > 0) &&
    options.join("\n") !== englishOptions.join("\n");
  if (optionsDiffer) {
    problems.push(
      sourceProblem(
        catalog.source,
        ["explanation", "options"],
        englishOptions.length === 0
          ? "the options must be the same commands as in English, which has none"
          : "the options must be the same commands, in the same order, as in English: " +
              englishOptions.join(", "),
      ),
    );
  }
  const example = explanation?.example;
  if ((complete || example !== undefined) && example !== english.example) {
    problems.push(
      sourceProblem(
        catalog.source,
        example === undefined ? ["explanation"] : ["explanation", "example"],
        english.example === undefined
          ? "the example must be the same command as in English, which has none"
          : example === undefined
            ? `the example is missing: English has ${english.example}`
            : `the example must be the same command as in English: ${english.example}`,
      ),
    );
  }
  return problems;
}

/** Problems of the UI catalogs against English: keys and placeholders. */
export function uiCompletenessProblems(
  catalogs: CheckedCatalogs<UiCatalog, UiCatalog>,
): ContentProblem[] {
  const english = catalogs.en;
  if (english === undefined) {
    return [];
  }
  const problems: ContentProblem[] = [];
  const translations = [...(catalogs.de === undefined ? [] : [catalogs.de]), ...catalogs.extra];
  if (catalogs.de !== undefined) {
    const german = catalogs.de;
    for (const key of english.value.keys()) {
      if (!german.value.has(key)) {
        problems.push(
          sourceProblem(german.source, [], `the UI text "${key}" is missing: English has it`),
        );
      }
    }
  }
  for (const catalog of translations) {
    for (const [key, text] of catalog.value) {
      const englishText = english.value.get(key);
      if (englishText === undefined) {
        problems.push(
          sourceProblem(catalog.source, key.split("."), `English has no UI text "${key}"`),
        );
        continue;
      }
      const expected = placeholderList(englishText, "en");
      const own = placeholderList(text, catalog.language);
      if (expected !== own) {
        problems.push(
          sourceProblem(
            catalog.source,
            key.split("."),
            expected === ""
              ? "the placeholders must be the same as in English, which has none"
              : `the placeholders must be the same as in English: ${expected}`,
          ),
        );
      }
    }
  }
  return problems;
}

/** The placeholders of a valid text as a sorted list, for example `{count} (number), {name}`. */
function placeholderList(source: string, language: string): string {
  const placeholders =
    messagePlaceholders(source, language) ?? new Map<string, ReadonlySet<PlaceholderUse>>();
  return [...placeholders]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, uses]) => `{${name}}${useList(uses)}`)
    .join(", ");
}

const USE_ORDER: readonly PlaceholderUse[] = ["text", "number", "select"];

function useList(uses: ReadonlySet<PlaceholderUse>): string {
  const named = USE_ORDER.filter((use) => use !== "text" && uses.has(use));
  return named.length === 0 ? "" : ` (${named.join(", ")})`;
}
