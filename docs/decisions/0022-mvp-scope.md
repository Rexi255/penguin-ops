# 0022. MVP scope: chapters 0–2 with the complete game frame

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The owner works on the project next to an apprenticeship, without a deadline, and values
quality over speed. Most of the effort lies in the frame (engine, UI, saving, tests, CI,
installer), not in individual tickets.

## Decision

- The MVP is **version 0.1**: chapters 0–2 (about 25–30 tickets: navigation, reading files,
  tidying up) with the complete game frame.
- Milestones M0–M5 lead to it (see `docs/ROADMAP.md`). Milestones have acceptance criteria
  instead of dates.
- Rough estimate: 50–70 small work packages; at 2–3 sessions per week with 1–2 packages each,
  roughly 4–8 months. Review and play-testing take most of the owner's time.

## Alternatives considered

- **Chapters 0–4 in the MVP:** more to play, but the first release comes months later and
  problems in the frame show up late.
- **Chapter 0 only:** a tech demo rather than a game.

## Consequences

- After v0.1, every further chapter is mostly content plus a few new commands.
