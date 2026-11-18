# 0080. Install impeccable as a pinned manual copy of the skill

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0039 decided to use the design skill [impeccable](https://github.com/pbakaus/impeccable)
(Apache-2.0) for this project only, as the skill without the design hook, pinned to a fixed
version, with telemetry off, without live mode, and with its own `.gitignore` recommendation.
ROADMAP M3.0a turns that into an installation.

impeccable offers four ways to install it: `npx impeccable install` (detects the tools, offers
the design hook and installs subagents), a Claude Code plugin, a git submodule linked with
`npx impeccable link`, and a manual copy of the committed per-tool build from the repository.
Its skill folder holds Markdown references, a POSIX launcher (`scripts/impeccable`), a Windows
launcher (`scripts/impeccable.cmd`) and data files. The launchers run a self-contained engine
binary that is downloaded once from the project's GitHub releases into `~/.impeccable/bin/` and
verified against `scripts/engine-checksums.txt`.

Releases are frequent (several per week). The newest release on 2026-11-18, `cli-v4.10.0`, was
published the same evening. In the committed builds of `cli-v4.10.0` and `cli-v4.9.2`,
`scripts/VERSION` names an engine version for which `engine-checksums.txt` has no checksums, so
the launcher refuses the engine download. `cli-v4.9.1` (2026-11-14) is consistent: engine
0.1.24 with checksums for all five platform binaries.

Telemetry is read from the environment (`DO_NOT_TRACK`, `IMPECCABLE_NO_TELEMETRY`), from
`~/.impeccable/config.json` and from the project's `.impeccable/config.json`. The same opt-out
also stops the upload of saved critiques and of health reports for signed-in users. The request
for visual directions to impeccable.style still happens when a new design starts; it is the
feature and only stops recording with telemetry off.

## Decision

- impeccable is installed as a manual copy of `.claude/skills/impeccable/` from the git tag
  `cli-v4.9.1` (commit `acb4cfe14470b1fdf51e855431af618d936b7db8`, skill version 4.9.1, engine
  0.1.24), byte for byte, plus the upstream `LICENSE` and `NOTICE.md` in the same folder.
- Only the skill is installed: no `.claude/settings.json` hooks and no `.claude/agents/` from
  impeccable. The skill uses its documented fallback references for missing subagents.
- `.impeccable/config.json` with `"telemetry": false` is committed, so telemetry is off for
  every clone and session, also when impeccable runs from a workspace folder such as `apps/ui`.
- `.gitignore` gets impeccable's recommended block between its `impeccable-ignore-start` and
  `impeccable-ignore-end` markers, plus `**/skills/impeccable/scripts/bin/` for engine binaries.
- The copied skill is third-party code that stays unchanged, so Prettier (`.prettierignore`) and
  ESLint (`eslint.config.js`) skip `.claude/skills/impeccable/`. No check is relaxed for the
  project's own code.
- `scripts/impeccable-setup.test.ts` guards the setup: pinned skill version, a checksum for
  every engine download of the pinned engine version, telemetry off, no impeccable hook or
  subagent, LF in the POSIX launcher and CRLF in the Windows launcher, and the `.gitignore`
  entries.
- An update is a deliberate work package: copy the folder from a newer tag whose `VERSION` and
  `engine-checksums.txt` match, raise the pinned version in the test, and record the update in
  `THIRD-PARTY-LICENSES.md`. `npx impeccable update` and `npx impeccable install` are not used,
  because they would install the hook and subagents.
- Live mode (`/impeccable live`, `generate`) and `/impeccable hooks on` are not used (ADR 0039).

## Alternatives considered

- **`npx impeccable install`:** the official path, but it installs the design hook and the
  subagents, which ADR 0039 rules out, and installs whatever version is current at that moment.
- **Git submodule with `npx impeccable link`:** pins a version through the submodule, but
  submodules need an extra `git submodule update` step in every clone, CI run and cloud
  session, and the owner has never used them.
- **Claude Code plugin:** installed per user, not per project, and follows the marketplace
  version instead of a pinned one.
- **Newest release `cli-v4.10.0` or `cli-v4.9.2`:** their committed builds pin an engine
  version without checksums, so the engine cannot be downloaded; `cli-v4.10.0` was also only
  hours old.

## Consequences

- impeccable works on Windows (verified: both launchers, engine download and checksum,
  `impeccable context`, `impeccable telemetry status` reports off).
- Cloud sessions are not verified yet; ADR 0039 requires that check. If a cloud sandbox blocks
  the engine download or `~/.impeccable/`, the skill falls back to reading `PRODUCT.md` and
  `DESIGN.md` directly; whether that is good enough is decided after the first cloud session.
- `impeccable context` treats this repository as a monorepo and asks for a target app
  (`apps/ui` or `apps/desktop`). M3.0b has to check that `PRODUCT.md` and `DESIGN.md` in the
  repository root (ADR 0039) are picked up as inherited root files from `apps/ui`.
- Updates take a little manual work, and the test makes an inconsistent update fail.
