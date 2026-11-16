# 0008. Deterministic engine

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

Tests compare outputs such as `ls -l` listings, generated log files and screenshots. If the
engine read the real clock or used real random numbers, results would differ between runs,
between Windows and Linux, and between local machines and CI.

## Decision

- The engine gets a **game clock** and a **seeded random number generator** injected. It never
  calls `Date.now()`, `new Date()` without arguments, `Math.random()` or anything else that
  depends on the real environment.
- World data generators (for example large log files) take a seed and always produce the same
  output for the same seed.
- Sorting and formatting follow the reference system (Debian 13, default English locale) and
  never the host machine's locale.

## Alternatives considered

- **Mocking time and randomness only in tests:** easy to forget and leaks into production
  behaviour.

## Consequences

- Same input gives the same output on every machine; tests and screenshots are reliable.
- In-game time is a design element (e.g. "Week 1 · Monday") instead of the real clock.
