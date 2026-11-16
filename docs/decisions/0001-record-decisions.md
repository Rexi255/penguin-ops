# 0001. Record decisions as numbered files

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

PenguinOps is built entirely with Claude Code. Every session starts without memory of earlier
sessions, and the owner steers through questions and reviews. Without a written record, the
reasons behind earlier choices get lost and are re-discussed or silently reversed.

## Decision

- Every significant decision gets one Markdown file in `docs/decisions/`, named
  `NNNN-kebab-case-title.md` with a four-digit running number, based on
  [`template.md`](template.md). Records are written in English.
- Status values: `Proposed`, `Accepted`, `Superseded by NNNN`.
- Accepted records are never rewritten (fixing typos and broken links is fine). When a decision
  changes, a new record is created that supersedes the old one; only the old record's status
  line is updated.
- Records 0002–0025 were written at the end of the planning phase on 2026-11-16. They capture
  the owner's choices between alternatives that Claude researched and recommended.

## Alternatives considered

- **One big decisions document:** grows long, mixes topics, and invites rewriting history.
- **Decisions only in commit messages or pull requests:** hard to find and to keep current.

## Consequences

- The "why" of every important choice has exactly one place.
- Writing a record costs a few minutes per decision. The `/adr` skill (milestone M0) makes it
  cheaper.
