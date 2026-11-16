# 0017. Game structure: chapters with an inbox, Story and Sandbox modes

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The prototype unlocks levels strictly one after another. Getting stuck on one ticket blocks
everything. The game should stay relaxed but guided, offer highlights, and let experienced
players practise freely.

## Decision

- **Chapters** (e.g. a training week or month) each offer several tickets in an **inbox** that
  can be solved in any order.
- Every chapter ends with an **incident**: a larger ticket that combines what was learned. It
  may have several steps, but has no timer and cannot be failed.
- Chapters also contain **review tickets** (older commands mixed in) and optional **side
  tickets** for deeper learning.
- **Game mode per save slot**, chosen when the slot is created and fixed afterwards:
  - **Story:** chapters unlock one after another; story scenes, mails and promotions are shown.
  - **Sandbox:** (1) **free play**: all chapters and tickets unlocked from the start, without
    story scenes (ticket texts stay; XP and achievements still count); (2) the **playground**:
    no tickets, the whole company world to explore freely.
- In Story mode the playground is unlocked after chapter 0, so options from the explanations
  can be tried safely.

## Alternatives considered

- **Strictly linear (prototype):** simple, but one hard ticket blocks the game.
- **Open sandbox only:** loses the learning curve.

## Consequences

- Unlock logic and progress display are a bit more complex (gameplay package).
- The playground needs its own world definition (milestone M4).
