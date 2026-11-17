// The bash builtin `cd` (ADR 0053), following bash 5.2's `cd_builtin` and
// `change_to_directory`. By default (`-L`) bash works out the new directory name by text from the
// remembered working directory and checks every step with stat(2); if that fails it still tries
// chdir(2), first with the absolute name and then with the operand as written. With `-P` it calls
// chdir(2) with the operand. On success `OLDPWD` gets the old value of `PWD` and `PWD` the new
// name.

import { builtinError, defineBuiltin } from "../builtins";
import type { CommandResult } from "../interpreter";
import {
  canonicalPath,
  changeDirectory,
  type ChangeDirectoryResult,
  directoryView,
  type DirectoryView,
  LOOKUP_ERROR_MESSAGES,
  makeAbsolute,
  physicalPath,
} from "./directory-names";

/** The exit status of `cd` when it fails. */
const FAILURE = 1;

export const cd = defineBuiltin({
  name: "cd",
  // `-@` exists only on systems with O_XATTR (Solaris), not on Linux.
  options: ["e", "L", "P"],
  simulated: ["e", "L", "P"],
  usage: "cd [-L|[-P [-e]] [-@]] [dir]",
  run: ({ world, session, name, options, operands, stdout, stderr }) => {
    const physical = options.reduce((last, letter) => {
      if (letter === "P") {
        return true;
      }
      return letter === "L" ? false : last;
    }, false);
    // `-e` counts only together with `-P`.
    const exitOnUnknownName = physical && options.includes("e");
    const fail = (message: string): CommandResult => {
      stderr(builtinError(name, message));
      return { exitStatus: FAILURE };
    };

    const [operand, ...more] = operands;
    let target: string;
    let printTarget = false;
    if (operand === undefined) {
      const home = session.variables.get("HOME");
      if (home === undefined) {
        return fail("HOME not set");
      }
      target = home;
    } else if (more.length > 0) {
      return fail("too many arguments");
    } else if (operand === "-") {
      const oldPwd = session.variables.get("OLDPWD");
      if (oldPwd === undefined) {
        return fail("OLDPWD not set");
      }
      target = oldPwd;
      printTarget = true;
    } else {
      const cdPath = session.variables.get("CDPATH");
      if (cdPath !== undefined && cdPath !== "" && !startsLikeAPath(operand)) {
        return { stop: { key: "variable-not-simulated", variable: "CDPATH" } };
      }
      target = operand;
    }

    const view = directoryView(world, session);
    const changed = physical ? changePhysically(view, target) : changeLogically(view, target);
    if (!changed.ok) {
      return fail(`${target}: ${LOOKUP_ERROR_MESSAGES[changed.error]}`);
    }
    if (printTarget) {
      stdout(`${target}\n`);
    }
    // Bash names the directory in `PWD` once more; with `-P` this can fail (`-e` reports it).
    const pwd = physical ? physicalPath(view, changed.path) : changed.path;
    const variables = new Map(session.variables);
    variables.set("OLDPWD", session.variables.get("PWD") ?? "");
    variables.set("PWD", pwd ?? changed.path);
    return {
      exitStatus: exitOnUnknownName && pwd === undefined ? FAILURE : 0,
      session: { ...session, cwd: changed.path, variables },
    };
  },
});

/**
 * Bash's `absolute_pathname`: `/…`, `.`, `./…`, `..` and `../…` are not looked up in `CDPATH`.
 */
function startsLikeAPath(operand: string): boolean {
  return /^(?:\/|\.\.?(?:\/|$))/u.test(operand);
}

/**
 * `cd -L`: the name by text if every step is a directory and chdir(2) to it works. Otherwise
 * chdir(2) to the absolute name as written, and if that fails, to `target` as written; then the
 * new name is what getcwd(3) returns. The error is the one of the first chdir(2).
 */
function changeLogically(view: DirectoryView, target: string): ChangeDirectoryResult {
  const absolute = makeAbsolute(target, view.cwd);
  const canonical = canonicalPath(view, absolute);
  const first = changeDirectory(view, canonical ?? absolute);
  if (first.ok) {
    return canonical === undefined ? first : { ok: true, path: canonical };
  }
  const second = changeDirectory(view, target);
  return second.ok ? second : first;
}

/**
 * `cd -P`: chdir(2) to `target` as written. The new name is the absolute name resolved by text
 * (keeping a leading `//`) if every step exists, else what getcwd(3) returns.
 */
function changePhysically(view: DirectoryView, target: string): ChangeDirectoryResult {
  const changed = changeDirectory(view, target);
  if (!changed.ok) {
    return changed;
  }
  const physical = physicalPath(view, makeAbsolute(target, view.cwd));
  return { ok: true, path: physical ?? changed.path };
}
