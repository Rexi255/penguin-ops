// The prompts of the interactive shell (ADR 0095): what bash 5.2 shows before each input line
// with the `PS1` of Debian 13's `/etc/skel/.bashrc`, the continuation prompt `PS2`, and what
// Ctrl+C at the prompt does to the shell. The UI draws the prompt; the colours of Debian's colour
// prompt become the UI's own (DESIGN.md), so this module returns the parts, not escape sequences.

import { type Session, userAtHost } from "./session";
import type { World } from "./world";

/**
 * The parts of Debian 13's colour prompt `\u@\h:\w\$ ` (with `color_prompt=yes`, which the
 * `.bashrc` sets for `TERM=xterm-256color`). Debian draws `user@host` and the directory in bold
 * colours; the separator `:` and the sign in the terminal's default colour.
 */
export interface PromptParts {
  /** `\u@\h`, see `userAtHost`. */
  readonly userAtHost: string;
  /** `\w`: the working directory, with the home directory shortened to `~`. */
  readonly directory: string;
  /** `\$`: `#` for root (user ID 0), `$` for everybody else. */
  readonly sign: "#" | "$";
}

/** bash's default `PS2`, the prompt of an input line that continues an incomplete input. */
export const CONTINUATION_PROMPT = "> ";

/** The exit status bash sets when Ctrl+C interrupts the input at the prompt: 128 + SIGINT. */
export const INTERRUPT_EXIT_STATUS = 130;

/**
 * Returns the parts of the primary prompt for `session`, like bash's `decode_prompt_string`
 * with Debian 13's `PS1`:
 *
 * - `\w` takes the value of `PWD`, or the working directory if `PWD` is unset, and shortens it
 *   like `polite_directory_format`: if `HOME` is longer than one character and the directory is
 *   `HOME` or lies below it, that part becomes `~`. `PROMPT_DIRTRIM` is not simulated.
 * - `\$` is `#` if the session's user ID is 0.
 *
 * The game does not simulate changing `PS1` or `PS2`. Throws an Error if the session's host is
 * not part of `world`.
 */
export function primaryPrompt(world: World, session: Session): PromptParts {
  return {
    userAtHost: userAtHost(world, session),
    directory: politeDirectory(
      session.variables.get("PWD") ?? session.cwd,
      session.variables.get("HOME"),
    ),
    sign: session.credentials.uid === 0 ? "#" : "$",
  };
}

/** The prompt as one line of text, as a terminal without colours shows it. */
export function promptText(parts: PromptParts): string {
  return `${parts.userAtHost}:${parts.directory}${parts.sign} `;
}

/**
 * The shell after Ctrl+C at the prompt: bash's `throw_to_top_level` discards the input line and
 * any earlier lines of an incomplete input, and sets the exit status to 130. Nothing else
 * changes; the history keeps what it held (the input was never recorded).
 */
export function interruptInput(session: Session): Session {
  return { ...session, exitStatus: INTERRUPT_EXIT_STATUS };
}

/** bash's `polite_directory_format`: `directory` with a leading `home` replaced by `~`. */
function politeDirectory(directory: string, home: string | undefined): string {
  if (home === undefined || home.length <= 1 || !directory.startsWith(home)) {
    return directory;
  }
  const rest = directory.slice(home.length);
  return rest === "" || rest.startsWith("/") ? `~${rest}` : directory;
}
