// The ncurses program `clear` 6.5 (ADR 0056), following `progs/clear.c` and `clear_cmd.c`: it
// reads its options with plain `getopt` (`T:Vx`), looks up the terminal type in `TERM` and
// writes the terminfo capabilities `clear` and `E3` to its standard output. On the game's
// terminal that gives a `clear-screen` event; into a pipe or a file it writes the escape
// sequences of `xterm-256color`, like the real program.

import type { RegisteredCommand } from "../command-registry";
import type { CommandResult } from "../interpreter";
import { optionErrorMessage, type OptionSpec, parseOptions } from "../options";
import { TERMINAL_TYPE } from "../session";

type ClearOption = "term" | "version" | "no-scrollback";

/** The option string `T:Vx` of `clear.c`. */
const OPTIONS: readonly OptionSpec<ClearOption>[] = [
  { id: "term", short: "T", argument: "required" },
  { id: "version", short: "V", argument: "none" },
  { id: "no-scrollback", short: "x", argument: "none" },
];

/** What `curses_version()` returns in Debian 13's ncurses 6.5+20250216. */
const CURSES_VERSION = "ncurses 6.5.20250216";

/** The terminfo capability `clear` of `xterm-256color`: cursor to the top left, erase the screen. */
const CLEAR_SCREEN = "\u001b[H\u001b[2J";

/** The terminfo capability `E3` of `xterm-256color`: erase the scrollback. */
const CLEAR_SCROLLBACK = "\u001b[3J";

/** The exit status of `clear` after an error, `EXIT_FAILURE`. */
const FAILURE: CommandResult = { exitStatus: 1 };

/** The usage text of `clear.c`, which it writes after every usage error. */
function usage(name: string): string {
  return (
    `Usage: ${name} [options]\n` +
    "\n" +
    "Options:\n" +
    "  -T TERM     use this instead of $TERM\n" +
    "  -V          print curses-version\n" +
    "  -x          do not try to clear scrollback\n"
  );
}

export const clear: RegisteredCommand = {
  name: "clear",
  run: ({ session, name, args, terminal, stdout, stderr }) => {
    const parsed = parseOptions(args, OPTIONS, "permute", "getopt");
    // `getopt` hands over the options one by one, and `clear` acts on each at once: `-V` exits
    // before later errors. `-T` stops the input like an unsimulated option of other commands.
    let clearsScrollback = true;
    for (const option of parsed.options) {
      switch (option.id) {
        case "term":
          return { stop: { key: "option-not-simulated", option: option.name } };
        case "version":
          stdout(`${CURSES_VERSION}\n`);
          return { exitStatus: 0 };
        case "no-scrollback":
          clearsScrollback = false;
          break;
      }
    }
    if (!parsed.ok) {
      stderr(optionErrorMessage(name, parsed.error) + usage(name));
      return FAILURE;
    }
    if (parsed.operands.length > 0) {
      stderr(usage(name));
      return FAILURE;
    }
    const term = session.variables.get("TERM");
    if (term === undefined || term === "") {
      stderr("TERM environment variable not set.\n");
      return FAILURE;
    }
    if (term !== TERMINAL_TYPE) {
      // Other terminal types need their own terminfo entries, which the game does not have.
      return { stop: { key: "variable-not-simulated", variable: "TERM" } };
    }
    if (terminal === undefined) {
      stdout(clearsScrollback ? CLEAR_SCREEN + CLEAR_SCROLLBACK : CLEAR_SCREEN);
    } else {
      terminal.clearScreen(clearsScrollback);
    }
    return { exitStatus: 0 };
  },
};
