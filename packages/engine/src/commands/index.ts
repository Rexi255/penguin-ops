// The simulated commands (ADR 0007, ADR 0053) and the game commands `help` and `hint`
// (ADR 0103). `COMMANDS` is the list that a game session registers with `createCommandLookup`;
// ROADMAP M1.8 to M1.10 add to it.

import type { RegisteredCommand } from "../command-registry";
import { cat } from "./cat";
import { cd } from "./cd";
import { clear } from "./clear";
import { cp } from "./cp";
import { echo } from "./echo";
import { grep } from "./grep";
import { head } from "./head";
import { createHelp } from "./help";
import { hint } from "./hint";
import { history } from "./history";
import { ls } from "./ls";
import { mkdir } from "./mkdir";
import { mv } from "./mv";
import { pwd } from "./pwd";
import { rm } from "./rm";
import { tail } from "./tail";
import { touch } from "./touch";
import { whoami } from "./whoami";

export {
  cat,
  cd,
  clear,
  cp,
  echo,
  grep,
  head,
  hint,
  history,
  ls,
  mkdir,
  mv,
  pwd,
  rm,
  tail,
  touch,
  whoami,
};

/** `help` describes every command of `COMMANDS`, itself included. */
const help = createHelp((name) => COMMANDS.some((command) => command.name === name));

/** All simulated commands and the game commands, sorted by name. */
export const COMMANDS: readonly RegisteredCommand[] = [
  cat,
  cd,
  clear,
  cp,
  echo,
  grep,
  head,
  help,
  hint,
  history,
  ls,
  mkdir,
  mv,
  pwd,
  rm,
  tail,
  touch,
  whoami,
];
