# 0023. Story and tone: everyday IT with humour and a quiet mystery

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The game should be relaxed and motivating over many chapters. The owner works in IT and knows
that real IT life is full of bizarre and wild situations.

## Decision

- Setting: realistic everyday IT work in a company. The player starts as an intern in the IT
  department; tickets come from colleagues.
- Tone: friendly and humorous, with plenty of jokes drawn from real IT life. The player is
  never the butt of the joke for making mistakes.
- A quiet overarching **mystery** runs through the chapters (working idea: the previous admin
  left suddenly, his notes are scattered across the servers, and odd things happen in the
  logs). It resolves gradually, without time pressure, and motivates exactly the skills being
  taught (reading logs, `grep`, `ssh`, checking permissions).
- The owner contributes real-life anecdotes as story material.
- Characters, company, host names and running gags are defined in `docs/STORY.md` (story
  workshop in milestone M4).

## Alternatives considered

- **Pure everyday IT without a mystery:** relatable, but lacks a pull to keep playing.
- **Hacker thriller (like Hacknet):** exciting, but contradicts "relaxed" and teaches attacking
  rather than administering.

## Consequences

- More text to write and review; `docs/STORY.md` keeps it consistent across sessions.
