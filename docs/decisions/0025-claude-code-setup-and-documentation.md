# 0025. Claude Code setup and documentation system

- Status: Accepted; partly superseded by [0027](0027-work-directly-on-main.md) (the
  documentation duty check runs on pushes to `main`, not on pull requests)
- Date: 2026-11-16
- Supersedes: –

## Context

Every Claude Code session must know immediately what was done, what is in progress and what
comes next, without the owner explaining it. Even if no human ever contributes, every new
session is effectively a new contributor that knows only what the repository says, so
contributor documentation matters. The owner talks to Claude in German; everything
in the repository is English. Facts about Claude Code were checked against its official
documentation on 2026-11-16:

- `CLAUDE.md` should stay under 200 lines; `@path` imports are loaded fully at session start.
- `.claude/rules/*.md` without `paths` frontmatter load at every start; with `paths` they load
  only when Claude reads matching files.
- Project skills live in `.claude/skills/<name>/SKILL.md`; `disable-model-invocation: true`
  stops Claude from invoking a skill on its own; committed project skills also load in cloud
  sessions.
- Hooks are configured in `.claude/settings.json`. SessionStart output is added to Claude's
  context. A Stop hook runs after every reply, including questions. On Windows, hooks need Git
  Bash or PowerShell, while exec-form hooks running `node` work everywhere.

## Decision

- **One place per piece of information:** goals in `docs/ROADMAP.md`, current state in
  `docs/STATUS.md`, reasons in `docs/decisions/`, technical changes in git history,
  player-visible changes in `CHANGELOG.md`, system design in `docs/ARCHITECTURE.md`, commands
  per chapter in `docs/CURRICULUM.md`, level format in `docs/LEVEL-AUTHORING.md`, story,
  characters, tone and the German/English glossary in `docs/STORY.md`, build commands in
  `package.json` scripts.
- **`CLAUDE.md`** (under 200 lines) holds the rules and imports `@docs/STATUS.md`.
- **Path-scoped rules** in `.claude/rules/`: `engine.md` (engine and gameplay packages),
  `content.md` (levels and catalogs), `ui.md` (apps).
- **Skills:** `/next` and `/wrap-up` (user-invoked only) now; `/adr` (M0), `/new-level` (M2),
  `/playtest` (M3) and `/release` (M5) are built when needed.
- **Hooks:** one SessionStart hook (Node.js script in exec form, works on Windows and Linux)
  that adds the current git state to the context. No Stop hook; the documentation duty is
  enforced in CI instead (a pull request that changes code or content must change
  `docs/STATUS.md`). Focused or skipped tests are caught by lint rules.
- The temporary planning log used during planning was split into these documents and deleted.

## Alternatives considered

- **Everything in `CLAUDE.md`:** too long; Claude follows long files less reliably.
- **Stop hook for the documentation duty:** fires after every reply and would nag; CI is
  stricter because nothing merges without it.
- **Bash hook scripts:** would require Git Bash on Windows.

## Consequences

- Each session starts with the current state and git context loaded automatically.
- Documentation updates are part of every pull request and checked by CI (from M0 on).
