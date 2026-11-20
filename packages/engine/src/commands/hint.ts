// The game command `hint` (ROADMAP M3.6b, ADR 0103): shows the ticket's next hint in the
// terminal, as F1 does in the ticket panel. The game counts the hints; the engine only reports
// that the player asked. It reads its arguments like a bash builtin without options: an option
// gives bash's usage error, an operand "too many arguments". Its text is the game's, so into a
// pipe or a file the input stops with a game notice.

import { builtinError, defineBuiltin } from "../builtins";

/** bash's exit status after "too many arguments", `EXECUTION_FAILURE`. */
const TOO_MANY_ARGUMENTS = 1;

export const hint = defineBuiltin({
  name: "hint",
  options: [],
  simulated: [],
  usage: "hint",
  run: ({ name, operands, terminal, stderr }) => {
    if (operands.length > 0) {
      stderr(builtinError(name, "too many arguments"));
      return { exitStatus: TOO_MANY_ARGUMENTS };
    }
    if (terminal === undefined) {
      return { stop: { key: "game-output-not-simulated" } };
    }
    terminal.showGameOutput({ kind: "hint" });
    return { exitStatus: 0 };
  },
});
