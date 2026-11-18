# 0052. Command registry with game notices for unsimulated options

- Status: Accepted; partly superseded by
  [0061](0061-rm-after-coreutils-9-7-with-unlink-and-rmdir-and-questions-that-stop-the-input.md)
  (what a stopping command may change)
- Date: 2026-11-17
- Supersedes: –

## Context

ROADMAP M1.7b completes the command framework of ADR 0007 on top of the option parser of
ADR 0051. Commands declare the complete option table of the real command, but the game simulates
only some options: `ls` has about 60, the game starts with `-l`, `-a` and `-1`. ADR 0007 and the
engine rules require that unsimulated options never pretend to work: the player gets a game
notice with a message key, which the UI renders in the player's language, and a non-zero exit
status. Until now the interpreter knew only one kind of game notice, `unsupported` for shell
features, which stops the rest of the input (ADR 0047). Without a shared mechanism, every
command of M1.8 to M1.10 would parse its options, write usage errors and report unsimulated
options on its own.

Open questions were: does an unsimulated option stop the input or does the command run without
it, which wins when an unsimulated option and an invalid option meet, and how a command hands a
game notice to the interpreter.

## Decision

- **`defineCommand(definition)`** in `packages/engine/src/command-registry.ts` builds a
  command from its name, its complete option table, the ids of the simulated options, its
  option order (`permute` by default) and its usage error status (2 for `ls` and `grep`, 1 for
  most coreutils). Before the command runs, it parses the arguments with `parseOptions`; the
  command's `run` gets the context plus `options` and `operands` and only ever sees valid,
  simulated options. The simulated options are listed (an allow list), so an option added to a
  table later is unsimulated until a command implements it.
- **An unsimulated option stops the input.** The command does not run, the interpreter adds a
  `notice` event with the command name and the notice `{ key: "option-not-simulated", option }`
  (the option's full name, such as `--almost-all` for `--alm`) and stops the rest of the input
  with exit status 1, exactly like an unsupported shell feature. Running the command without the
  option would show output the real command would not show, and a following `&&` or `||` would
  act on a guessed exit status.
- **An unsimulated option before the first parse error wins.** `parseOptions` now also returns
  the options it read before an error, because `getopt_long` hands them to the command before
  it reports the error, and the command may act on them at once (`head --help --nope` prints the
  help). Since the game cannot know what an unsimulated option would do, it reports the notice.
  An error before any unsimulated option gives glibc's message and the coreutils' "Try ...
  --help" line on standard error and the usage error status; the input goes on, like in bash.
  Only the first unsimulated option is reported, like the first error.
- **Commands return a `CommandResult`**, which is either a `CommandExit` (exit status and
  optional changed world and session, as before) or a `CommandStop` with a `CommandNotice`. A
  stopping command changes nothing; the output it wrote before stays, its redirected files stay
  opened, and in a pipeline its standard error is shown before the notice. `CommandNotice` is a
  union of message keys; it starts with `option-not-simulated`, and later commands add keys for
  other things they do not simulate.
- **`createCommandLookup(commands)`** turns registered commands into the interpreter's
  `CommandLookup`. Names are exact; an empty name, a name with `/` or a name used twice throws.
  Commands without a `getopt_long` table (`echo`, and bash builtins with their own message
  format in M1.8) register a plain `ShellCommand` under their name.
- Invalid definitions (invalid option table, a simulated id not in the table, a usage error
  status outside 1 to 255) throw when the command is defined, because they are programming
  errors; `validateOptionSpecs` is exported for this.

## Alternatives considered

- **Run the command and ignore the unsimulated option:** the output would look real but be
  wrong, which the engine rules forbid.
- **Return exit status 1 for the command but go on with the input:** `ls -Z || rm -r docs`
  would run the second command because of a guessed failure.
- **Report every unsimulated option of a command line in one notice:** more information, but
  the order rule (an unsimulated option before an error wins) would become unclear, and one
  option at a time matches how the real commands stop at the first problem.
- **Let parse errors always win over unsimulated options:** `head --help --nope` would print an
  error where Debian prints the help.
- **A non-stopping notice channel (`context.notice`) now:** no command needs one yet. It is
  added with the first command that has to report something while it goes on.
- **A literal `kind` tag on `CommandResult`:** every command, including the plain ones, would
  have to write `kind: "exit"`; the variants are told apart by the `stop` field instead.

## Consequences

- The commands of M1.8 to M1.10 declare their real tables, list their simulated options and
  implement only those; usage errors and notices need no code in the commands.
- The UI needs a message in both languages for each `CommandNotice` key when it renders the
  shell events.
- Bash builtins (`cd`, `pwd`, `history`) need their own usage error format (`bash: cd: -x:
  invalid option` and a usage line); M1.8 adds it, either as a second definition style or as
  plain commands that call `parseOptions` with `require-order`.
- Obsolete syntax such as `head -5` and option arguments that are only partly simulated (for
  example `ls --color=always`) remain the job of each command; they can return a `CommandStop`
  with a new notice key.
