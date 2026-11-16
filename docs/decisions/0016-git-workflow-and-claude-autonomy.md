# 0016. Git workflow: pull requests, autonomous merging with guardrails

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

Claude Code does the development work, locally (VS Code on Windows) and in cloud sessions. The
owner wants as little manual work as possible but no broken `main`. On GitHub Free, branch
protection and unlimited CI minutes are only available for public repositories, and the first
commit carried the owner's private email address.

## Decision

- **Public repository.** Before switching to public, the initial commit is rewritten to use the
  owner's GitHub noreply address (explicitly allowed by the owner, including the one-time force
  push to `main`), and the owner enables GitHub's email privacy settings.
- **Branch protection on `main`** (set up in milestone M0 once CI exists): pull request
  required, required CI checks, no force pushes, squash merge only.
- **One branch and one pull request per work package**, merged as a single squash commit.
- **Commit messages** follow Conventional Commits in English (`feat:`, `fix:`, `docs:`,
  `test:`, `refactor:`, `chore:`).
- **Versioning:** SemVer, `0.x` until the first finished version. A release is a git tag; CI
  builds the Windows installer and the AppImage and publishes a GitHub Release with notes from
  `CHANGELOG.md`.
- **Dependabot** proposes grouped dependency updates weekly; Electron major upgrades are done
  deliberately.
- **Claude's autonomy** (explicitly granted by the owner): create branches, commit, push, open
  and update pull requests, fix CI failures and squash-merge once all required checks are
  green, without asking.
- **Guardrails**, because no human reviews before the merge:
  1. Never weaken a check to make CI green: no skipped, focused or deleted tests, no lowered
     coverage target, no removed CI jobs, no relaxed lint rules, no changes to branch
     protection. Fix the cause or ask.
  2. Ask the owner before merging a pull request that changes `CLAUDE.md`, anything in
     `.claude/`, `.github/workflows/`, `license-policy.json` or an accepted decision record, or
     that deletes levels or story content.
  3. After every merge, give the owner a short German summary of what was merged.

## Alternatives considered

- **Private until MVP:** no branch protection on GitHub Free, limited CI minutes (Windows
  minutes cost more).
- **GitHub Pro:** costs money or a Student Developer Pack application.
- **Direct commits to `main`:** no safety net at all.
- **Owner merges every pull request:** more control, but more clicks; the owner chose
  autonomy with guardrails.

## Consequences

- `main` only changes through green pull requests.
- The owner reviews after the fact, guided by Claude's German summaries.
