---
name: adr
description: Creates a new PenguinOps decision record in docs/decisions/ with the next number via npm run adr:new, handles superseded records and fills in the sections. Use when the user types /adr or when an important decision has to be recorded.
---

# New decision record

Record one decision as `docs/decisions/NNNN-kebab-case-title.md` (ADR 0001, ADR 0038). The
record is English; talk to the user in German.

## 1. Clarify the decision

- What was decided, and has the owner agreed? A record is written after the decision, not
  instead of asking. If the decision is still open, ask the user in German first.
- Find related records: `grep -ril "<keyword>" docs/decisions/`. Read the ones that cover the
  same topic.
- Decide for each related record whether the new decision replaces it completely, replaces only
  a part of it (the scope, e.g. "the list of approved exceptions"), or leaves it untouched.
- Choose a title in sentence case that names the decision, e.g. "No branch protection on main".

## 2. Create the file

Run the script; never create, number or rename a record by hand:

```bash
npm run adr:new -- "Title in sentence case" --supersedes 27 --partly "5:the list of approved exceptions"
```

- `--supersedes <number>`: the new record replaces that record completely.
- `--partly "<number>:<scope>"`: the new record replaces only `<scope>`. The old record shows
  `(scope)`, the new one `(only scope)`, so write the scope as a noun phrase that reads well in
  both.
- Both options are repeatable; leave them out if nothing is superseded.
- The script prints the created file and every updated status line. If it fails, read the
  message, fix the cause (wrong number, record already superseded, proposed record) and run it
  again. Do not work around it by editing files by hand.

## 3. Write the record

- Fill in Context, Decision, Alternatives considered and Consequences, replacing every template
  sentence. Decision states what was decided so that it can be checked; Alternatives explain
  why each one was not chosen.
- Wrap Markdown by hand at 100 characters (Prettier skips `*.md`).
- Set the status to `Accepted` once the owner has decided; keep `Proposed` only while the
  decision is still open.
- Check the status lines the script rewrote in superseded records: only the status line may
  change. Never rewrite the rest of an accepted record (typo and link fixes are fine).

## 4. Finish

- Reference the record where the decision matters (`docs/ARCHITECTURE.md`, `CLAUDE.md`,
  other docs) as part of the documentation duty in `CLAUDE.md`.
- Commit the record together with the work package it belongs to.
- A commit that changes an accepted record (also only its status line) needs the user's OK
  before pushing, unless the user asked for exactly that change (`CLAUDE.md`, Git).
- Tell the user in German, in one or two sentences, which record was created and which
  records were superseded.
