// The simulated commands (ADR 0007, ADR 0053). `COMMANDS` is the list that a game session
// registers with `createCommandLookup`; ROADMAP M1.8 to M1.10 add to it.

import type { RegisteredCommand } from "../command-registry";
import { cd } from "./cd";
import { echo } from "./echo";
import { ls } from "./ls";
import { pwd } from "./pwd";
import { whoami } from "./whoami";

export { cd, echo, ls, pwd, whoami };

/** All simulated commands, sorted by name. */
export const COMMANDS: readonly RegisteredCommand[] = [cd, echo, ls, pwd, whoami];
