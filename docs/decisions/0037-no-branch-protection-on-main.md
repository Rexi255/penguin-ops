# 0037. No branch protection on main

- Status: Accepted
- Date: 2026-11-17
- Supersedes: [0027](0027-work-directly-on-main.md) (only the branch protection of M0.10)

## Context

ADR 0027 reduced branch protection (ROADMAP M0.10) to blocking force pushes and deletion of
`main`, set up by the owner as a GitHub ruleset. Claude cannot change repository settings from
its sessions, so the step needs the owner. The owner wants Claude to be able to do all work on
`main` without any repository settings in the way, and decided not to set up branch protection.

## Decision

- `main` has no branch protection and no ruleset. ROADMAP M0.10 is dropped.
- The process guardrails of ADR 0027 stay in force unchanged: never force-push or rewrite
  published history on `main`, never weaken a check, run `npm run check` before every commit,
  fix a red CI run on `main` before new work.
- Outside contributors still cannot push to `main`, because only collaborators have write
  access; they use forks and pull requests (`CONTRIBUTING.md`).

## Alternatives considered

- **Ruleset that blocks force pushes and deletion (ADR 0027):** would not get in the way of
  direct pushes, but needs the owner to set it up, and the owner declined.
- **Ruleset with required pull requests or status checks:** would block direct pushes to
  `main`, which contradicts ADR 0027.

## Consequences

- Nothing technical stops a force push or the deletion of `main`; the rules in `CLAUDE.md` are the
  only protection. A lost or overwritten `main` can be restored by pushing an up-to-date local
  clone.
- The remark in ADR 0036 that branch protection could require the CI checks no longer applies.
- M0 is complete once M0.11 is done; its "Done when" no longer requires a protected `main`.
- The decision can be revisited at any time by a new record, for example when outside
  contributors get write access.
