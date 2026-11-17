# 0047. Shell execution of lists, pipelines and assignments

- Status: Accepted
- Date: 2026-11-17
- Supersedes: [0043](0043-game-clock-and-world-builder.md) (only who advances the game clock)

## Context

ROADMAP M1.6b is the second part of the shell interpreter (ADR 0007, ADR 0046): it runs the
syntax tree of the parser (ADR 0045). The engine has no real processes, so pipelines, exit
codes and subshells have to be simulated deterministically. Commands need an interface before
the command framework (M1.7) and the first real commands (M1.8) exist. Redirections need the
write side of the file system and follow in M1.6c. ADR 0043 left open who advances the game
clock and by how much; without it, all changes of a session get the same mtime. ADR 0043 also
said that only the owner of the clock (the gameplay package or a test) advances it.

## Decision

- **Module.** `packages/engine/src/interpreter.ts` exports `runScript({ world, session, script,
  commands, clock })`, which returns the new world, the new session and a list of events.
- **Command interface.** A `ShellCommand` is a function that gets a `CommandContext` (world,
  session, expanded name and arguments, standard input, the read-only `Clock`, and `stdout` and
  `stderr` writers) and returns a `CommandResult` (exit status 0 to 255, and a changed world or
  session if it changed them). `commands` is a `CommandLookup` from a name to a command; the
  registry of M1.7 provides it. An exit status outside 0 to 255 is a bug and throws a
  `RangeError`.
- **Events.** `runScript` returns `ShellEvent`s in order: `output` (stream `stdout` or `stderr`
  and text; neighbouring output to the same stream is merged) and `unsupported` (feature and
  input offset) as a game notice. M1.7 adds the notices of commands.
- **Lists.** And-or lists run in order. `&&` runs the next pipeline after exit status 0, `||`
  after any other status; a skipped pipeline keeps the status of the previous one. The session's
  `exitStatus` (`$?`) is updated after every command. An empty input keeps the exit status.
- **Pipelines.** The commands run one after the other from left to right; the standard output of
  each is the standard input of the next as text. Standard input of the first command is the
  terminal (`stdin` is `undefined`). Standard error of every command and standard output of the
  last one go to the terminal in the order the commands ran. The exit status is that of the last
  command (no `pipefail`). In a pipeline of two or more commands every command runs in a
  subshell: changes to the session (variables, working directory) are discarded, changes to the
  world (files) stay.
- **Simple commands** in POSIX order: words are expanded first, then assignments from left to
  right, each seeing the ones before it. Without a command name (no words, or words that expand
  to nothing) the assignments set shell variables and the exit status is 0. Before a command
  name they apply only to that command; afterwards every assigned name gets its earlier value
  back (or is unset again), including when the command changed it. `+=` appends to the current
  value.
- **Command not found.** An unknown name writes `bash: NAME: command not found` to standard
  error and has exit status 127; assignments before it are not kept.
- **Unsupported features stop the input.** Expansion errors (`$$`, `$-`), any redirection (until
  M1.6c) and command names with a `/` (`./run.sh`, `/bin/ls`, until the file system has
  executables) end the whole input with an `unsupported` event and exit status 1, as bash
  discards the rest of the input line after an expansion error. Changes made before the stop
  stay, including world changes of earlier commands in the same pipeline.
- **Game clock.** `runScript` takes the `GameClock` and advances it by `TIME_PER_INPUT` (one
  second) before it runs an input, once per input, also for an empty one. Commands get only the
  read-only `Clock`. This replaces the rule of ADR 0043 that only the gameplay package or a test
  advances the clock; the gameplay package may still advance it further (for example a new day
  per ticket).

## Alternatives considered

- **The gameplay package advances the clock:** the engine would stay read-only, but every
  caller of `runScript` (gameplay, tests, the developer mode) would have to repeat the same step,
  and forgetting it gives identical mtimes again.
- **Advance the clock per command instead of per input:** `touch a; touch b` would give
  different mtimes, but a pipeline or a long list would move time by its length, and players
  rarely compare mtimes within one input. Per input is simpler to explain.
- **Real concurrent pipelines:** not deterministic and not needed; the simulated commands do not
  wait for each other's output.
- **Keep session changes in pipelines:** simpler, but `cd /tmp | true` would change the working
  directory, which bash never does.
- **Commands return their output as strings instead of writers:** the order of standard output
  and standard error inside one command (for example `ls` with a missing and an existing file)
  would get lost.
- **Run the rest of the input after an unsupported feature:** later commands would run in a
  state the player did not expect (`cd $$ && rm *`); stopping is safer and matches bash after
  expansion errors.
- **Search `PATH` for commands now:** needs executables in the file system; the lookup by name
  stays until then.

## Consequences

- M1.7 builds the registry, the option parser and the error formats on `ShellCommand` and
  `CommandLookup`, and adds command notices to the events.
- M1.6c replaces the `redirection` stop with real redirections.
- The UI needs game notice message keys for `redirection` and `command-path`.
- Commands that read the terminal (`cat` without arguments) must handle `stdin` being
  `undefined` because the game does not simulate typing into a running command.
- `PATH` does not affect command lookup yet; `PATH= ls` still finds `ls`. This is recorded in
  the ROADMAP ideas.
- Every input moves the game time by one second, so tests of later commands see mtimes of
  `start + 1000 * n`.
