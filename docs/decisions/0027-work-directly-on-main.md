# 0027. Work directly on main

- Status: Accepted
- Date: 2026-11-16
- Supersedes: [0016](0016-git-workflow-and-claude-autonomy.md)

## Context

ADR 0016 planned one branch and one pull request per work package, squash-merged by Claude
once CI is green. After the first code work package (M0.2) the owner decided that branches and
pull requests add steps without benefit for a one-person project, and explicitly asked that all
work happens directly on `main` from now on.

Without pull requests there is no point where a red check can stop a change before it reaches
`main`. The local gate and the remaining guardrails therefore carry the safety net.

## Decision

- **All work happens on `main`.** No feature branches, no pull requests for the owner's and
  Claude's work. Each work package ends with one or a few commits on `main`, pushed to
  `origin/main`.
- **Commit messages** follow Conventional Commits in English (`feat:`, `fix:`, `docs:`,
  `test:`, `refactor:`, `chore:`), as before.
- **Local gate before every commit:** `npm run check` must pass (from ROADMAP M0.6 on). Never
  commit a red state.
- **CI on every push to `main`** (from M0.9 on) runs the gate of ADR 0015, including the
  documentation duty check (a push that changes code or content must change
  `docs/STATUS.md`). A red CI run on `main` is fixed first, before any new work.
- **Claude's autonomy** (explicitly granted by the owner): commit and push to `main` and fix
  CI failures without asking.
- **Guardrails:**
  1. Never weaken a check: no skipped, focused or deleted tests, no lowered coverage target,
     no removed CI jobs, no relaxed lint rules, no changes to branch protection. Fix the cause
     or ask.
  2. Ask the owner before pushing a commit that changes `CLAUDE.md`, anything in `.claude/`,
     `.github/workflows/`, `license-policy.json` or an accepted decision record, or that
     deletes levels or story content, unless the owner asked for exactly that change.
  3. Never force-push or rewrite published history on `main`.
  4. After every push, give the owner a short German summary of what was pushed.
- **Visual changes:** show the owner before/after screenshots in the session before
  committing.
- **Cloud sessions** also push to `main`. Only if the environment cannot push to `main`, push to
  the session's branch, open a pull request with the screenshots and squash-merge it as soon as
  all checks are green.
- **Branch protection (M0.10)** is reduced to what works without pull requests: block force
  pushes and deletion of `main`.
- **Outside contributors** cannot push to `main`; they still use forks and pull requests
  (`CONTRIBUTING.md`).
- Where ADR 0015 and ADR 0025 say "pull request" for the gate and the documentation duty check,
  this now means "push to `main`".

## Alternatives considered

- **Keep branches and pull requests (ADR 0016):** CI can block bad changes before `main`, but
  the owner finds the extra steps not worth it for a one-person project.
- **Branches without pull requests:** the same extra steps, no extra safety.

## Consequences

- Less ceremony: a work package goes straight from the working tree to `main`.
- A broken commit can reach `main`; it is found by CI after the push and must be fixed
  immediately. The local `npm run check` is the main gate.
- `main` cannot be protected with required checks, because GitHub would then require pull
  requests.
- `CLAUDE.md`, `CONTRIBUTING.md`, the roadmap (M0.9, M0.10), the skills `/next` and `/wrap-up`,
  the UI rules and the SessionStart hook are updated accordingly.
