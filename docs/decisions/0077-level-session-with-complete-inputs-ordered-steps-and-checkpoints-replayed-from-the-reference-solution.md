# 0077. Level session with complete inputs, ordered steps and checkpoints replayed from the reference solution

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M2.5 needs the gameplay core: a level session that builds the level's world, runs the
player's commands, evaluates the goal, steps, tips and extra goals (ADR 0011), and resumes a
multi-step ticket at its last completed step (ADR 0013). ADR 0013 rejected full world snapshots
in save games, so a checkpoint is only a step ID. The parser returns syntax errors, incomplete
input and unsupported syntax as values (ADR 0045), and nothing turned them into terminal output
yet. The base world format and the player's account were decided in ADR 0076.

## Decision

- **Pure and immutable.** `startLevel(setup, clock, checkpoint?)` returns a `LevelSession` value
  (`level`, `world`, `shell`, `completedSteps`, `solved`, `shownTips`, `reachedExtraGoals`);
  `runInput(session, input, { clock, terminal })` returns a new one. The game clock is passed
  in, as in the engine (ADR 0008).
- **Start.** The world is `levelWorldSpec` built with the clock's time: the base world, the
  player's account on every host, the start files on the start host, `~/` as the player's home,
  prose files in the player's language. The player logs in on the start host and is moved to
  `start.cwd` (`cwd` and `PWD`), which must be a directory. The player's name must follow
  ADR 0019 and must not be a user or group of the world. Nothing is evaluated at the start.
- **Complete inputs.** An input that bash would continue on the next line (open quote, trailing
  backslash, trailing `|`, `&&` or `||`) gives `incomplete` and changes nothing, not even the
  history or the clock; the terminal asks for the next line and submits the joined input again.
  Every other input is saved in the history like bash (lines with syntax errors too) and moves
  the clock by one second. A syntax error writes
  ``bash: syntax error near unexpected token `…'`` to standard error with exit status 2, as
  interactive bash 5.2 does. Syntax the game does not simulate gives a `syntax-unsupported`
  terminal event with exit status 1 and runs nothing. Everything else runs with `runScript`.
- **The session records the history.** The terminal keeps the history navigation and replaces
  the session's `shell` with the result of `acceptHistoryLine` before it submits the input; it
  no longer calls `recordHistory` itself.
- **Evaluation after every input**, against the world, the shell and the terminal output of the
  input (ADR 0067), with game events in this order:
  1. Until the ticket is solved: a single goal solves it when it holds. In a multi-step ticket
     the next step is completed when its goal holds; then the following step is checked against
     the same state, so one input can complete several steps, but a later step never counts
     before the earlier ones. The ticket is solved with its last step. Events:
     `step-completed` (with the step's `say` key) and `solved`. A solved ticket stays solved.
  2. Every extra goal that holds is reached once, also after the ticket is solved
     (`extra-goal` with its XP).
  3. While the ticket is not solved, every tip that holds and was not shown is shown once, in
     the order of the level (`tip` with its text key). The input that solves the ticket shows
     no tips.
- **Checkpoints.** `lastCompletedStep(session)` is the ID that save games keep. Resuming at a
  checkpoint starts the level and plays its **first reference solution** until that step is
  completed, then clears the history, the shown tips and the reached extra goals of the replay.
  The world is the reference solution's world at that step; the player's own way to it is not
  kept. The content tests make sure the first reference solution completes every step in order.

## Alternatives considered

- **Restarting a multi-step ticket from the start:** simple, but ADR 0013 promises a resume at
  the last completed step.
- **A world snapshot per checkpoint:** rejected by ADR 0013; snapshots break when levels change
  in updates.
- **Step goals that may be completed in any order:** some tickets read naturally that way, but
  step messages tell a story in order, and a step that is true early would be completed without
  the player noticing.
- **Tips also after solving:** a tip for a mistake is noise once the ticket is done.
- **The terminal joins incomplete lines itself without asking the session:** it would need to
  know bash's rules for open quotes and operators; the parser already knows them.

## Consequences

- The UI (M3) shows `TerminalEvent`s in the terminal and `GameEvent`s in the ticket panel, and
  asks for a next line with the continuation prompt on `incomplete`.
- A checkpoint replay uses the commands of the first reference solution, so that solution must
  pass through every step; the content tests (M2.4b) check it.
- Extra goals that depend on the way a ticket was solved (for example "with one command") need
  rule types that look at the command line; ADR 0011 allows them only for tips and extra goals.
