# 0103. Game commands help and hint as builtins that show the game's texts in the terminal

- Status: Accepted
- Date: 2026-11-20
- Supersedes: –

## Context

The curriculum teaches the game commands `help` and `hint` in the first chapter
(`docs/CURRICULUM.md`), and ROADMAP M3.6 adds them. Both answer in the player's language, while
the engine never produces translatable text (ADR 0007, ADR 0012). bash itself has a builtin
`help` (`help cd` prints the builtin's help). F1 already shows the ticket's next hint in the ticket
panel, and the UI counts the hints in the ticket's progress (ADR 0098), which asked that the
command `hint` count the same hints. The owner decided that the game's `help` replaces bash's
builtin, that `help NAME` describes every command the game simulates in a short text of the game,
and that `hint` counts like F1 and also writes the hint into the terminal.

## Decision

- **Commands of the engine.** `help` and `hint` are registered with the simulated commands
  (`packages/engine/src/commands/help.ts`, `hint.ts`), so they run in lists, after `&&`, with
  expanded arguments and with Tab completion like every other command. Each reads its arguments
  like a bash builtin (`defineBuiltin`): `help` has bash's options `-d`, `-m` and `-s`, which the
  game does not simulate (a notice stops the input, as for `--help`); `hint` has none, so an
  option gives bash's usage error and an operand `bash: hint: too many arguments` with status 1.
- **Game output.** A command whose standard output goes to the terminal gets
  `CommandTerminal.showGameOutput`, which adds a `game-output` event to the input's events at
  that point of the output: `help` (the overview), `help-topic` and `help-unknown` with the name,
  or `hint`. The UI writes the texts. Into a pipe or a file the game's text cannot go: the input
  stops with the new notice `game-output-not-simulated` (its text follows ADR 0102). The text is
  no output for the level's rules.
- **`help`.** Without operands it shows the overview: what the terminal is, the game commands,
  the keys and the names of every simulated command (`COMMAND_NAMES`, game commands included).
  Each operand shows the description of that command (`help-topics.<name>` in the UI catalogs,
  one or two sentences with an example) or says that the game does not know the name. Like bash,
  the status is 1 only when no operand is a known command. Names are matched exactly, not as
  bash's patterns.
- **`hint`.** The level session adds a `hint-requested` game event for every `hint` that showed
  its output, before the input's other game events. The ticket's progress counts it like F1
  (`showNextHint`), and the Tickets tab comes to the front as after F1. The terminal writes the
  hint with its label ("Hint 2 of 3") after the hints seen so far; once all three are seen it says
  so. The terminal gets the ticket's hints and the count from the game screen and counts the hints
  of an input itself until the game screen has drawn them.
- **Look.** A game command's text is a line of the game like a notice: the UI face in the
  notice's muted colour with the handbook icon for `help` and the hint icon for `hint`, its
  paragraphs and lists like a ticket text, the commands of the overview as a wrapping row of code.

## Alternatives considered

- **Keep bash's `help` and name the game's help differently (`penguin help`):** the curriculum
  and the ticket texts say `help`, and a beginner types `help` first. bash's help covers only
  builtins, which says little to a beginner about `ls` or `grep`.
- **`help NAME` only for the game commands, the rest in the handbook (M3.11):** the owner wanted
  a description for every command now; the handbook can show more later.
- **Game commands handled by the UI before the shell runs the line:** `hint; ls` or `help ls` with
  a variable would not work like other commands, and Tab completion and the history would treat
  them differently.
- **The game's text as standard output in English:** it would not be in the player's language,
  and the level's rules would see it as output of the shell.
- **The hint count in the level session:** ADR 0098 keeps it with the rest of the ticket's
  progress in the UI; the session only reports that the player asked.
- **`hint` only in the ticket panel with a short line in the terminal:** the owner wanted the hint
  where the player is typing.

## Consequences

- A new simulated command needs a description in both UI catalogs; a test fails without it.
- A screen reader hears a hint asked for with `hint` twice: from the terminal's log and from the
  ticket panel's live region. The accessibility work of ROADMAP M3.14 decides whether one of them
  stays quiet.
- The save system (M3.7) keeps the terminal's lines with their messages; a hint line keeps its
  number.
- The handbook (M3.11) can grow from the `help` descriptions.
