# 0024. Curriculum principles and the nano editor

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The game teaches Linux from first steps to the core skills of IT specialists in system
integration. The order must keep the learning curve flat. From chapter 5 on, players edit
configuration files.

## Decision

- The curriculum has 15 chapters (0–14), defined in `docs/CURRICULUM.md`, ordered by three
  principles: read before change, one host before many, every chapter builds on the previous
  one. Chapters 6–13 (users and permissions, processes, services and logs, network, remote
  access, software, backup, scripts) are the core for system integration work.
- The editor taught in chapter 5 is a simulated **`nano`** (shortcuts are shown on screen, easy
  for beginners). **`vim`** comes later as an optional, humorous side chapter.
- `man` pages stay English (part of the Linux world); German explanations go into the in-game
  handbook.

## Alternatives considered

- **Network and SSH earlier:** important for system integration, but needs the multi-host
  engine, `sudo` and config editing first.
- **`vim` only:** available on every server, but a wall for beginners.
- **No interactive editor:** unrealistic; configs are edited in editors in real life.

## Consequences

- The full-screen program mechanism (ADR 0007) is needed for `less` in the MVP and for `nano`
  in chapter 5.
