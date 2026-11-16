# 0011. Declarative check rules and mandatory reference solutions

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

A level must recognise when a ticket is solved. Several solution paths must be possible
(the prototype checks state, not the typed command). Checks must be testable automatically,
independent of the language and of the player's user name. The owner delegated this decision
to Claude.

## Decision

- Goals, step goals, tips and extra goals use the same **fixed rule types**, combinable with
  `all`, `any` and `not`. Initial rule types (from the prototype levels): `cwd_is`, `exists`,
  `file_exists`, `dir_exists`, `file_contains`, `same_content`, `output_contains`,
  `output_matches`. Later examples: `mode_is`, `owner_is`, `service_running`, `script_works`.
- Whether a ticket is solved never depends on the typed command line, only on the world state
  or on command output. Optional technique tips ("with `grep -r` it would have been faster")
  may look at commands but never block progress.
- Every level has at least one **reference solution** (a list of commands). Automated tests
  replay every reference solution in every language and with two different user names, and
  assert: the goal is reached afterwards, the goal is not reached at the start, and no tip
  fires during the reference solution.
- If a level needs a check that cannot be expressed, a new rule type is added to the engine
  with unit tests and an entry in `docs/LEVEL-AUTHORING.md`. Code inside a level is never
  allowed.

## Alternatives considered

- **Expression language** (e.g. `exists('~/x') && cwd == '~/y'`): flexible, but a second parser
  to maintain, and errors show only at runtime.
- **Code per level (prototype style):** maximum flexibility, but not statically checkable and
  easy to make language-dependent.

## Consequences

- The schema catches typos in rules at build time.
- Every level is provably solvable in every language before it ships.
