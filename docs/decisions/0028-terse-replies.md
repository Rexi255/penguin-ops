# 0028. Terse replies to the owner

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The owner prefers less text in Claude's replies and asked for the "caveman" skill (a style of
very compressed answers) in this repository. That skill is installed in the owner's personal
Claude setup, not in the repository; its license is unknown, so copying it into this MIT
project is not allowed without a license check (ADR 0005). The owner is also learning
TypeScript, so explanations of new concepts must stay understandable.

## Decision

- `CLAUDE.md` gets a "Reply style" section written in the project's own words: replies to the
  owner are short and direct; no filler, pleasantries, repetition or narration of tool calls;
  facts, commands, numbers and error messages stay exact.
- Clarity wins over brevity for explanations of new concepts, security warnings, irreversible
  actions and step-by-step instructions for the owner.
- The style applies only to chat replies. Everything written into the repository or onto
  GitHub stays normal, complete English prose.
- The caveman skill itself is not copied into the repository. The owner can still start it
  personally with `/caveman` for even shorter answers.

## Alternatives considered

- **Copy the caveman skill into `.claude/skills/`:** unknown license; it would also not apply
  automatically, because a skill must be invoked in every session.
- **No rule, start `/caveman` manually each session:** easy to forget after `/clear`.

## Consequences

- Every session, including cloud sessions, answers tersely by default.
- `/next` and `/wrap-up` keep their structure but use fewer lines.
