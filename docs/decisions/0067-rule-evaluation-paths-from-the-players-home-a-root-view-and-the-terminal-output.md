# 0067. Rule evaluation: paths from the player's home, a root view and the terminal output

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0011 decided that levels check their goals, tips and extra goals with fixed, declarative
rule types (`cwd_is`, `exists`, `file_exists`, `dir_exists`, `file_contains`, `same_content`,
`output_contains`, `output_matches`) combined with `all`, `any` and `not`, and that rules never
depend on the typed command line, translated text or the player's user name. ROADMAP M1.12
implements them in the engine. ADR 0011 left open what the rules exactly see: how paths are
written and resolved, whether permissions count, what "the output of the last command" is, and
which regular expressions `output_matches` takes.

## Decision

- **Rules are engine values.** `src/rules.ts` defines `Rule` as a discriminated union
  (`{ kind: "cwd_is", path }`, `{ kind: "all", rules }`, …). The YAML form of the levels
  (`{ cwd_is: "~/reports" }`) is mapped to it by the content package (M2.1), so the engine
  stays free of parsing.
- **Paths** are absolute or start with `~/` (or are `~`). `~` is the home directory of the
  session's user as the host's user list has it, not the variable `HOME`, which the player can
  change. `~name` and relative paths are invalid, so that rules cannot name the player and do
  not depend on the working directory. `.`, `..`, repeated and trailing slashes are resolved.
- **A root view.** Paths are looked up on the session's host with root's credentials:
  permissions do not count, so a goal "the file exists" holds even if the player made it
  unreadable. `cwd_is` compares the normalised working directory with the normalised path; the
  directory need not exist any more.
- **Regular files only** for `file_contains` and `same_content`; a directory never matches.
  `same_content` needs both files to exist.
- **Output** is what the last input wrote to the terminal: standard output and standard error
  in the order written, as `terminalOutput(events)` collects them from the interpreter's
  events. Output redirected into files, game notices and screen clears do not count (a clear
  does not remove earlier output). Before the first input the output is empty.
- **`output_matches`** takes a JavaScript regular expression, used with the flags `m` and `u`
  and found anywhere in the output (`^` and `$` also match at line breaks).
- **Validation.** `checkRule` rejects invalid paths, invalid patterns and an `all` or `any`
  without rules with an `InvalidRuleError`; `evaluateRule` checks the rule before it evaluates
  it. The content tests of M2.4 will call `checkRule` for every rule of every level.
- **Hosts.** Paths are looked up on the host of the session that is passed in. Rules for other
  hosts (after `ssh`) get an explicit host field when a level needs them.

## Alternatives considered

- **Paths relative to the working directory:** the same rule would mean different files
  depending on where the player stands, which makes goals unpredictable.
- **Checks with the player's permissions:** a goal could then fail because of an unrelated
  permission change, and permission goals are clearer as their own rule types (`mode_is`,
  `owner_is`, planned).
- **Only standard output as output:** tips often react to error messages ("No such file or
  directory"), which go to standard error; the player sees both streams in the same terminal.
- **POSIX regular expressions for `output_matches`:** the engine has a translator for grep's
  patterns (ADR 0064), but level authors are more likely to know JavaScript's syntax, and the
  pattern is part of the level data, not of the simulated Linux.

## Consequences

- The gameplay package (M2, M3) keeps the output of the last input with `terminalOutput` and
  evaluates goals, tips and extra goals with `evaluateRule` after every input.
- `docs/LEVEL-AUTHORING.md` documents the path form, the root view and the regular expression
  flavour.
- New rule types extend the union, `checkRule`, the evaluation and the authoring guide
  together, with tests.
