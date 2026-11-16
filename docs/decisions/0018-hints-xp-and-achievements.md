# 0018. Free hints; rewards for curiosity

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The prototype gave 25 bonus XP for solving a ticket without hints. That indirectly punishes
asking for help and contradicts the goal "relaxed, no failure, only hints".

## Decision

- Hints are free and unlimited (three levels per ticket: tip, concrete tip, solution).
- Every solved ticket always gives its full XP. The "no hint" bonus is removed.
- Bonus XP comes from optional **extra goals** (e.g. "solve it with a pipe", "try an option
  from the explanation") and from side tickets.
- **Achievements** reward exploration (e.g. "used 10 different commands", "found the hidden
  note"; "Sudo Ergo Sum" for the first `sudo`).
- **Ranks** stay (provisional: intern, trainee, admin, senior admin; final names in
  `docs/STORY.md`). Promotions happen as small story moments at the end of a chapter.

## Alternatives considered

- **Keep the prototype's bonus:** contradicts the relaxed design.
- **No XP at all:** calmest, but feels less like a game.

## Consequences

- Extra goals and achievements must be written for each ticket and chapter.
- Players who want more challenge get it without anyone losing anything.
