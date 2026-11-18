// The simulated commands (ADR 0007, ADR 0053). `COMMANDS` is the list that a game session
// registers with `createCommandLookup`; ROADMAP M1.8 to M1.10 add to it.

import type { RegisteredCommand } from "../command-registry";
import { cat } from "./cat";
import { cd } from "./cd";
import { clear } from "./clear";
import { echo } from "./echo";
import { history } from "./history";
import { ls } from "./ls";
import { pwd } from "./pwd";
import { whoami } from "./whoami";

export { cat, cd, clear, echo, history, ls, pwd, whoami };

/** All simulated commands, sorted by name. */
export const COMMANDS: readonly RegisteredCommand[] = [
  cat,
  cd,
  clear,
  echo,
  history,
  ls,
  pwd,
  whoami,
];
