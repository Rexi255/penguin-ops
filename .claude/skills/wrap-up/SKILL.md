---
name: wrap-up
description: End-of-session check for PenguinOps. Verifies git state and documentation, runs the checks, commits leftovers and gives the user a short German summary. Only run when the user types /wrap-up.
disable-model-invocation: true
---

# Wrap-up

Close the session cleanly. Everything written into the repository is English; talk to the user
in German. Do not start new work in this skill.

## 1. Git state

- Run `git status` and `git log --oneline origin/main..HEAD`.
- Note uncommitted changes, unpushed commits and this session's commits.
- If possible, check the latest CI run on `main` (`gh run list --branch main --limit 1`).

## 2. Documentation check

For every work package of this session, check and fix where needed:

- `docs/STATUS.md` reflects reality: Recently completed (last ~5 items), In progress, Next 3
  steps (ROADMAP ids), Blockers and open questions. It fits on one screen; update the date.
- `docs/ROADMAP.md`: completed items are ticked.
- `docs/decisions/`: every new or changed decision has a record; accepted records were not
  rewritten.
- `docs/ARCHITECTURE.md`, `CHANGELOG.md` (Unreleased), `docs/LEVEL-AUTHORING.md`,
  `docs/CURRICULUM.md`, `docs/STORY.md`, `THIRD-PARTY-LICENSES.md`: updated where affected.

## 3. Checks

- Run `npm run check` (once it exists, ROADMAP M0.6).
- If something fails, fix it or report it. Never weaken a check.

## 4. Commit leftovers

- If there are uncommitted changes, show the user the proposed Conventional Commit message
  (English), then commit on `main` and push, following the Git rules in `CLAUDE.md`.
- Push any unpushed commits. Afterwards the working tree is clean and `main` equals
  `origin/main`, so the user can safely run `/clear` and continue with `/next`.

## 5. Summary for the user (German, terse, at most 8 lines)

- What was done in this session.
- What is still open or blocked.
- The next step from `docs/STATUS.md`.
- Anything the user has to do (for example: confirm a push, test on Windows, decide
  something).
