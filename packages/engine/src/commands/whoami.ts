// The coreutils command `whoami` 9.7 (ADR 0053): writes the name of the user of the session's
// effective user ID. Its only options are `--help` and `--version`, which the game does not
// simulate; any operand is an error.

import { defineCommand } from "../command-registry";
import { tryHelpMessage } from "../options";
import { localeQuote } from "../quote";
import { findHost, findUserByUid } from "../world";

/** The exit status of `whoami` after an error, coreutils' `EXIT_FAILURE`. */
const FAILURE = 1;

export const whoami = defineCommand({
  name: "whoami",
  options: [
    { id: "help", long: "help", argument: "none" },
    { id: "version", long: "version", argument: "none" },
  ],
  simulated: [],
  usageErrorStatus: FAILURE,
  run: ({ world, session, name, operands, stdout, stderr }) => {
    const [extra] = operands;
    if (extra !== undefined) {
      stderr(`${name}: extra operand ${localeQuote(extra)}\n${tryHelpMessage(name)}`);
      return { exitStatus: FAILURE };
    }
    const host = findHost(world, session.host);
    if (host === undefined) {
      throw new Error(`the session's host "${session.host}" is not part of the world`);
    }
    const uid = session.credentials.uid;
    const user = findUserByUid(host, uid);
    if (user === undefined) {
      stderr(`${name}: cannot find name for user ID ${String(uid)}\n`);
      return { exitStatus: FAILURE };
    }
    stdout(`${user.name}\n`);
    return { exitStatus: 0 };
  },
});
