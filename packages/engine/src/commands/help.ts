// The game command `help` (ROADMAP M3.6b, ADR 0103). It takes the place of bash's builtin `help`
// and reads its options like it (`help [-dms] [pattern ...]`), none of which the game
// simulates. Without operands it shows the game's overview; each operand shows the description
// of a command the game simulates, or that the game does not know that name. The texts are the
// game's, in the player's language, so they appear only in the terminal: into a pipe or a file
// the input stops with a game notice.

import { defineBuiltin } from "../builtins";
import type { RegisteredCommand } from "../command-registry";

/** bash's exit status when no help topic matched, `EXECUTION_FAILURE`. */
const NO_TOPIC = 1;

/**
 * The command `help`. `isTopic` says whether a name is a command the game simulates, which has a
 * description.
 */
export function createHelp(isTopic: (name: string) => boolean): RegisteredCommand {
  return defineBuiltin({
    name: "help",
    options: ["d", "m", "s"],
    simulated: [],
    usage: "help [-dms] [pattern ...]",
    run: ({ operands, terminal }) => {
      if (terminal === undefined) {
        return { stop: { key: "game-output-not-simulated" } };
      }
      if (operands.length === 0) {
        terminal.showGameOutput({ kind: "help" });
        return { exitStatus: 0 };
      }
      let found = false;
      for (const topic of operands) {
        if (isTopic(topic)) {
          found = true;
          terminal.showGameOutput({ kind: "help-topic", topic });
        } else {
          terminal.showGameOutput({ kind: "help-unknown", topic });
        }
      }
      // Like bash, `help` fails only when no operand matched.
      return { exitStatus: found ? 0 : NO_TOPIC };
    },
  });
}
