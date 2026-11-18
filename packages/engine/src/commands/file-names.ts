// File names as gnulib's helpers build them by text (ADR 0062): `last_component`,
// `strip_trailing_slashes` and `file_name_concat`, which `cp` and `mv` use to name the copy of a
// source inside a target directory.

/**
 * gnulib's `last_component`: the part of `name` after the last slash that is followed by
 * something else, with trailing slashes kept (`a/b/` gives `b/`); `/` gives the empty text.
 */
export function lastComponent(name: string): string {
  let base = 0;
  while (name[base] === "/") {
    base++;
  }
  let sawSlash = false;
  for (let index = base; index < name.length; index++) {
    if (name[index] === "/") {
      sawSlash = true;
    } else if (sawSlash) {
      base = index;
      sawSlash = false;
    }
  }
  return name.slice(base);
}

/** gnulib's `strip_trailing_slashes`: removes trailing slashes, but `/` stays `/`. */
export function stripTrailingSlashes(name: string): string {
  return name.slice(0, baseLen(name));
}

/**
 * gnulib's `file_name_concat` without a suffix: `directory` up to the end of its last component
 * (trailing slashes go, but a root of slashes stays), a slash if neither side has one there,
 * and `base`.
 */
export function fileNameConcat(directory: string, base: string): string {
  const directoryBase = lastComponent(directory);
  const baseLength = baseLen(directoryBase);
  const length = directory.length - directoryBase.length + baseLength;
  const kept = directory.slice(0, length);
  const needsSeparator = baseLength > 0 && !kept.endsWith("/") && !base.startsWith("/");
  return kept + (needsSeparator ? "/" : "") + base;
}

/** gnulib's `base_len`: the length of `name` without trailing slashes, at least 1 if not empty. */
function baseLen(name: string): number {
  let length = name.length;
  while (length > 1 && name[length - 1] === "/") {
    length--;
  }
  return length;
}

/**
 * The name of the copy of the source `arg` in the target directory `target`, as cp.c and mv.c
 * build it: the last component of `arg` without trailing slashes, where `..` counts as `.`.
 */
export function nameInDirectory(target: string, arg: string): string {
  const base = stripTrailingSlashes(lastComponent(arg));
  return fileNameConcat(target, base === ".." ? "." : base);
}
