// Files and directories that content creates in the simulated world, written as a map from
// paths to contents (ADR 0068, ADR 0076): the start files of a level (`start.files`) and the
// files of a base world's hosts (`content/worlds/<world-id>.yaml`). A path that ends with "/"
// names a directory. Level files may take prose from the catalogs (`{ text: <key> }`); base
// worlds have no catalogs, so their files are always literal.

import { z } from "zod";

/** Where the content of a file comes from. */
export type FileSource =
  /** Literal content, technical and always English. */
  | { readonly kind: "content"; readonly content: string }
  /** Prose from the text catalogs, translated. */
  | { readonly kind: "text"; readonly key: string };

/** Owner, group and permission bits of a file or directory; unset means the default. */
export interface FileAttributes {
  /** Name of the owning user. */
  readonly owner?: string;
  /** Name of the owning group. */
  readonly group?: string;
  /** Permission bits as a number, for example 0o640. */
  readonly mode?: number;
}

/** A file or directory that content creates. */
export type FileEntry =
  | (FileAttributes & {
      readonly kind: "file";
      /** Absolute or starting with `~/`. */
      readonly path: string;
      readonly source: FileSource;
    })
  | (FileAttributes & {
      readonly kind: "directory";
      /** Absolute or starting with `~/`, without the trailing slash of the YAML key. */
      readonly path: string;
    });

/** User and group names as the engine allows them. */
export const ACCOUNT_NAME_PATTERN = /^[^\s:/]+$/u;
/** Permission bits as `ls -l` shows them, with setuid, setgid and sticky. */
const MODE_PATTERN = /^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/u;

const modeSchema = z
  .string()
  .regex(MODE_PATTERN, {
    error: 'a mode is written like ls -l shows it, for example "rw-r-----"',
  })
  .transform(parseMode)
  .meta({ description: 'Permission bits like ls -l shows them, for example "rw-r-----".' });

/** A user or group name. */
export const accountNameSchema = z.string().regex(ACCOUNT_NAME_PATTERN, {
  error: "a user or group name must not be empty or contain spaces, colons or slashes",
});

const contentSchema = z
  .string()
  .meta({ description: "Literal content: technical, always English." })
  .optional();

const attributeSchemas = {
  owner: accountNameSchema.meta({ description: "Name of the owning user." }).optional(),
  group: accountNameSchema.meta({ description: "Name of the owning group." }).optional(),
  mode: modeSchema.optional(),
};

/**
 * The schema of a map of files that may take prose from the catalogs (`start.files` of a
 * level): a file is its literal content, `{ text: <key> }` or an object with `content` or
 * `text` and attributes. `what` names the files in messages, for example "start file".
 */
export function proseFileEntriesSchema(what: string, textKey: z.ZodType<string, string>) {
  const fileObjectSchema = z
    .strictObject({
      content: contentSchema,
      text: textKey
        .meta({ description: "Prose content: a key of the level's text catalogs." })
        .optional(),
      ...attributeSchemas,
    })
    .meta({ not: { required: ["content", "text"] } });
  return fileEntriesSchema(
    what,
    "content or text",
    'A file (literal content, { text: key } or { content, owner, group, mode }) or, for a path that ends with "/", a directory ({} or { owner, group, mode }).',
    fileObjectSchema,
  );
}

/**
 * The schema of a map of literal files (the files of a base world's host): a file is its
 * content or an object with `content` and attributes.
 */
export function literalFileEntriesSchema(what: string) {
  return fileEntriesSchema(
    what,
    "content",
    'A file (literal content or { content, owner, group, mode }) or, for a path that ends with "/", a directory ({} or { owner, group, mode }).',
    z.strictObject({ content: contentSchema, ...attributeSchemas }),
  );
}

/**
 * The schema of a map from paths to files and directories, turned into a list of entries in the
 * order of the map. Checks the paths and the entries together (see `checkFileEntries`).
 * `contentKinds` names what a file needs in messages.
 */
function fileEntriesSchema<Input>(
  what: string,
  contentKinds: string,
  description: string,
  fileObjectSchema: z.ZodType<FileObject, Input>,
) {
  const valueSchema = z
    .union(
      [
        z.string().meta({ description: "Literal content of a file: technical, always English." }),
        fileObjectSchema,
      ],
      {
        error: `a ${what} is its content (a string) or an object with ${contentKinds}; a directory is {} or an object with owner, group and mode`,
      },
    )
    .meta({ description });

  // The paths are checked together with the values: zod would replace the message of a key
  // check with a general "Invalid key in record".
  return z
    .record(
      z.string().meta({
        description:
          'An absolute path or a path that starts with "~/"; a directory if it ends with "/".',
        pattern: "^(?:/|~/)",
      }),
      valueSchema,
    )
    .superRefine((files, context) => {
      checkFileEntries(files, what, contentKinds, (path, message) => {
        context.addIssue({ code: "custom", path: [path], message });
      });
    })
    .transform((files) => Object.entries(files).map(([path, value]) => toFileEntry(path, value)));
}

/** A file object after parsing: the mode is a number. */
export interface FileObject {
  readonly content?: string | undefined;
  readonly text?: string | undefined;
  readonly owner?: string | undefined;
  readonly group?: string | undefined;
  readonly mode?: number | undefined;
}

/** A file value after parsing: its content, or an object with the mode as a number. */
type FileValue = string | FileObject;

/** Why a key of a file map is not a valid path, or `undefined` if it is. */
function filePathProblem(path: string, what: string): string | undefined {
  if (!path.startsWith("/") && !path.startsWith("~/")) {
    return `a ${what} path must be absolute or start with "~/" (the player's home)`;
  }
  const components = path.slice(path.startsWith("/") ? 1 : 2).split("/");
  if (components.at(-1) === "") {
    components.pop();
  }
  if (components.length === 0) {
    return `a ${what} path must name a file or directory below the root or the home`;
  }
  if (components.some((component) => component === "" || component === "." || component === "..")) {
    return `a ${what} path must not contain empty components, "." or ".."`;
  }
  return undefined;
}

/**
 * Checks the files together: every path is valid, a directory path takes no content, a file
 * path needs one, a path is not both a file and a directory, and nothing lies inside a file.
 */
function checkFileEntries(
  files: Readonly<Record<string, FileValue>>,
  what: string,
  contentKinds: string,
  report: (path: string, message: string) => void,
): void {
  const filePaths = new Set<string>();
  const paths: string[] = [];
  for (const path of Object.keys(files)) {
    const problem = filePathProblem(path, what);
    if (problem === undefined) {
      paths.push(path);
    } else {
      report(path, problem);
    }
  }
  for (const path of paths) {
    const value = files[path];
    if (isDirectoryPath(path)) {
      if (typeof value === "string" || value?.content !== undefined || value?.text !== undefined) {
        report(path, `a directory (path ending with "/") has no ${contentKinds}`);
      }
    } else {
      filePaths.add(path);
      if (typeof value === "object" && value.content === undefined && value.text === undefined) {
        report(path, `a file needs ${contentKinds}; end the path with "/" for a directory`);
      }
      if (typeof value === "object" && value.content !== undefined && value.text !== undefined) {
        report(path, "a file has either content or text, not both");
      }
    }
  }
  for (const path of paths) {
    const bare = withoutTrailingSlash(path);
    if (isDirectoryPath(path) && filePaths.has(bare)) {
      report(path, `"${bare}" is both a file and a directory`);
    }
    for (const filePath of filePaths) {
      if (bare.startsWith(`${filePath}/`)) {
        report(path, `"${path}" lies inside the file "${filePath}"`);
      }
    }
  }
}

function toFileEntry(path: string, value: FileValue): FileEntry {
  if (typeof value === "string") {
    return { kind: "file", path, source: { kind: "content", content: value } };
  }
  const attributes: FileAttributes = {
    ...(value.owner === undefined ? {} : { owner: value.owner }),
    ...(value.group === undefined ? {} : { group: value.group }),
    ...(value.mode === undefined ? {} : { mode: value.mode }),
  };
  if (isDirectoryPath(path)) {
    return { kind: "directory", path: withoutTrailingSlash(path), ...attributes };
  }
  // checkFileEntries made sure that a file has content or text.
  const source: FileSource =
    value.text === undefined
      ? { kind: "content", content: value.content ?? "" }
      : { kind: "text", key: value.text };
  return { kind: "file", path, source, ...attributes };
}

function isDirectoryPath(path: string): boolean {
  return path.endsWith("/");
}

function withoutTrailingSlash(path: string): string {
  return isDirectoryPath(path) ? path.slice(0, -1) : path;
}

/** Turns a mode like `rwxr-s--T` into its number. */
export function parseMode(mode: string): number {
  const SPECIAL_BITS = [0o4000, 0o2000, 0o1000];
  let bits = 0;
  for (let triplet = 0; triplet < 3; triplet += 1) {
    const [read, write, execute] = mode.slice(triplet * 3, triplet * 3 + 3);
    const shift = (2 - triplet) * 3;
    const special = SPECIAL_BITS[triplet] ?? 0;
    if (read === "r") bits |= 0o4 << shift;
    if (write === "w") bits |= 0o2 << shift;
    if (execute === "x" || execute === "s" || execute === "t") bits |= 0o1 << shift;
    if (execute === "s" || execute === "S" || execute === "t" || execute === "T") bits |= special;
  }
  return bits;
}
