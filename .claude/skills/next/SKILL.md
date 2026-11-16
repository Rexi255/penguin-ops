---
name: next
description: Proposes the next small PenguinOps work package from docs/STATUS.md and docs/ROADMAP.md, explains it in German and waits for the user's OK before changing anything. Use when the user types /next or asks what to do next.
---

# Next step

Find the next small work package, explain it, and wait for the user's OK. Talk to the user in
German; everything written into the repository is English.

## 1. Read the state

- Read `docs/STATUS.md` and `docs/ROADMAP.md`.
- Check `git status`, unpushed commits (`git log --oneline origin/main..HEAD`) and, if
  possible, the latest CI run on `main` (`gh run list --branch main --limit 1`).

## 2. Finish open work first

- If there are uncommitted changes, unpushed commits or a red CI run on `main` from earlier
  work, propose finishing that before anything new.

## 3. Pick the package

- Take the first unchecked item of the current milestone in `docs/ROADMAP.md`, following
  "Next 3 steps" in `docs/STATUS.md`.
- If it is too big for one session, propose a smaller slice and say how the rest is split.
- If the item is the user's task (for example GitHub settings), give step-by-step instructions
  instead.

## 4. Present it (German, terse, about 8–12 lines; reply style in `CLAUDE.md`)

- **Was:** the package in one sentence, with its ROADMAP id.
- **Warum jetzt:** why this is the right next step.
- **Was neu ist:** concepts the user will meet for the first time, each explained in one
  sentence.
- **Betroffene Bereiche:** folders or files that change.
- **Fertig, wenn:** acceptance criteria and the tests that prove them.
- **Größe:** S, M or L.

## 5. Wait

- Ask for the user's OK. Do not change any file before the user agrees.
- If the user wants something else, adjust the proposal.
- After the OK: do the work on `main` and follow the Definition of Done and the Git rules in
  `CLAUDE.md`.
