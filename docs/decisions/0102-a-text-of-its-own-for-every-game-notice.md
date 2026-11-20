# 0102. A text of its own for every game notice

- Status: Accepted
- Date: 2026-11-20
- Supersedes: [0095](0095-terminal-component-on-a-pure-terminal-model-with-debians-prompt-and-readlines-keys.md)
  (only the general text of game notices)

## Context

ADR 0095 drew every game notice in the terminal with one general text: "PenguinOps does not
simulate this yet, so the input stopped here." The engine already reports what stopped the input:
a command notice with its key and values (`option-not-simulated` with the option,
`variable-not-simulated` with the variable, `invalid-utf8-not-simulated`,
`terminal-input-not-simulated`, ADR 0052), or the shell feature the lexer, the parser or the
interpreter does not simulate (35 features such as `here-document`, `for-loop` or
`command-path`). The general text left the player guessing which part of the input it meant.
ROADMAP M3.6 renders the notices in the player's language with their own texts.

## Decision

- **One text per notice.** Every command notice key and every unsupported shell feature has a
  text of its own in the UI catalogs, under the key `notices.<key>` or `notices.<feature>`, in
  English and German. The general text `terminal.notice` is gone.
- **Content of the texts.** A feature's text names the feature and its syntax in code (here
  strings (`<<<`)) and ends like the general text: the game does not simulate it yet, so the input
  stopped here. `command-path` adds what to do instead: type the command by its name. A command
  notice names the command as the player wrote it and its option or variable, all three as code
  values; `terminal-input-not-simulated` says that the command would wait for typed input.
- **Checked completeness.** `apps/ui/src/terminal/notice-text.ts` builds the key from the event
  with template literal types, so the type check fails when the engine adds a feature or a notice
  key without a text in `UI_TEXT_PLACEHOLDERS`; the catalog test checks that both catalogs hold
  every key with its placeholders. A test runs one input per notice through the level session and
  checks that it shows that notice's text and that the inputs cover every `notices.*` key.
- **Look.** Unchanged from ADR 0095: one paragraph in the UI face with the hint icon; code in the
  text uses the monospace face like code elsewhere in the UI.

## Alternatives considered

- **A feature name inserted into one shared sentence:** a value is either text or code, never
  markup (ADR 0073), so a name that mixes both such as "here strings (`<<<`)" could not be passed,
  and German needs the name in a different place and case than English. A full sentence per
  feature keeps the grammar with the translator.
- **The feature name as a heading above the general sentence:** two parts that a screen reader
  reads as one run-on line, and the general sentence still says "this" instead of naming it.
- **A text per command for its notices:** the notices are the same for every command; the
  command's name as a value is enough.

## Consequences

- A new unsupported feature or notice key in the engine needs a text in both catalogs and an
  input in the notice test before the type check and the tests pass.
- The texts say "yet": when a later milestone simulates a feature, its notice text goes away with
  the feature.
- Each text repeats the end of the sentence, so a change of that wording touches every notice
  text.
