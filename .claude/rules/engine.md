---
paths:
  - "packages/engine/**"
  - "packages/gameplay/**"
---

# Rules for the engine and gameplay packages

## Purity and determinism

- No DOM, no Node APIs (`fs`, `path`, `process`, `Buffer`, timers), no network.
- No real time and no real randomness: never call `Date.now()`, `new Date()` without arguments,
  `performance.now()` or `Math.random()`. Use the injected game clock and seeded random
  generator (ADR 0008).
- No global mutable state and no singletons. Every API takes the world, host or session it
  works on (ADR 0009: several hosts).

## Realism

- Simulated commands behave like Debian 13 (bash, GNU coreutils, default English locale):
  output format, error messages, exit codes (ADR 0004).
- If you are not sure how real Debian 13 behaves, tell the user instead of guessing silently,
  and put `@differential` into the test name so milestone M6 verifies it against the real
  system.
- Unsupported options or features never pretend to work. Emit a game notice event with a
  message key (ADR 0007) and return a non-zero exit code.
- The engine never produces translatable text. Command output is English like real Linux;
  game messages are structured events with message keys.

## Code

- Use discriminated unions for AST nodes, events, rule types and commands; `switch` over them
  must be exhaustive.
- Prefer small, clearly named functions over clever code. Performance is not a concern.

## Tests

- Every command has unit tests for normal use, every supported option, and error cases
  (missing operand, no such file or directory, not a directory, permission denied, is a
  directory) including exit codes.
- Every rule type has unit tests and an entry in `docs/LEVEL-AUTHORING.md`.
- Engine coverage must stay at or above 90 %.
- Save format changes (gameplay): bump the format version, add a migration and a test with a
  stored example save of the old version (ADR 0013).
