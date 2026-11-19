// The game's content, bundled into the renderer at build time (ADR 0090): Vite reads every
// `.yaml` file below the repository's `content/` folder as text, and the app checks it at start
// with the same loader as the content tests. The generated JSON Schemas are not content.

import {
  CONTENT_FOLDER,
  type Content,
  type ContentFile,
  formatProblem,
  loadContent,
  sortContentFiles,
} from "@penguin-ops/content";
import { config as configureZod } from "zod";

/** The path of the content folder as the bundled files' keys start with it. */
const BUNDLE_PREFIX = "../../../../content/";

const BUNDLED_FILES = import.meta.glob<string>("../../../../content/**/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The content could not be loaded: a problem the content tests should have found first. */
export class ContentLoadError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`The bundled content has problems:\n${problems.join("\n")}`);
    this.name = "ContentLoadError";
    this.problems = problems;
  }
}

/**
 * Turns bundled files, keyed by their path from this module, into content files with their path
 * from the repository root (`content/...`).
 */
export function contentFilesFromBundle(bundle: Readonly<Record<string, string>>): ContentFile[] {
  return Object.entries(bundle).map(([key, text]) => {
    if (!key.startsWith(BUNDLE_PREFIX)) {
      throw new Error(`The bundled file ${key} lies outside the content folder.`);
    }
    return { file: `${CONTENT_FOLDER}/${key.slice(BUNDLE_PREFIX.length)}`, text };
  });
}

/** Sorts and loads content files; throws a `ContentLoadError` that lists every problem. */
export function loadContentFiles(files: readonly ContentFile[]): Content {
  const sorted = sortContentFiles(files);
  const loaded = loadContent(sorted.files);
  const problems = [...sorted.problems, ...(loaded.ok ? [] : loaded.problems)];
  if (problems.length > 0 || !loaded.ok) {
    throw new ContentLoadError(problems.map(formatProblem));
  }
  return loaded.value;
}

/** Loads the content that is bundled with the app. */
export function loadBundledContent(): Content {
  // zod compiles fast validators with `new Function` when it may. The strict Content Security
  // Policy forbids that (ADR 0014), and zod's probe for it would be reported as a policy
  // violation, so zod runs without compiling.
  configureZod({ jitless: true });
  return loadContentFiles(contentFilesFromBundle(BUNDLED_FILES));
}
