// The bash builtin `pwd` (ADR 0053), following bash 5.2's `pwd_builtin`. By default (`-L`) it
// writes the working directory as bash remembers it, without asking the file system. With `-P`
// it resolves that name by text and checks that every step exists; if one does not, it asks the
// kernel (getcwd(3)) and remembers that answer. Operands are ignored.

import { defineBuiltin } from "../builtins";
import { currentDirectory, directoryView, physicalPath } from "./directory-names";

/** What bash writes when getcwd(3) fails because the working directory was removed. */
const GETCWD_FAILED =
  "pwd: error retrieving current directory: getcwd: cannot access parent directories: " +
  "No such file or directory\n";

export const pwd = defineBuiltin({
  name: "pwd",
  options: ["L", "P"],
  simulated: ["L", "P"],
  usage: "pwd [-LP]",
  run: ({ world, session, options, stdout, stderr }) => {
    if (options.at(-1) !== "P") {
      stdout(`${session.cwd}\n`);
      return { exitStatus: 0 };
    }
    const view = directoryView(world, session);
    const physical = physicalPath(view, session.cwd);
    if (physical !== undefined) {
      stdout(`${physical}\n`);
      return { exitStatus: 0 };
    }
    const fromKernel = currentDirectory(view);
    if (fromKernel === undefined) {
      stderr(GETCWD_FAILED);
      return { exitStatus: 1 };
    }
    stdout(`${fromKernel}\n`);
    return { exitStatus: 0, session: { ...session, cwd: fromKernel } };
  },
});
