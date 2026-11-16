# 0005. MIT license and dependency allowlist

- Status: Accepted; partly superseded by [0031](0031-lightningcss-license-exception.md) (lightningcss
  added to the approved exceptions)
- Date: 2026-11-16
- Supersedes: –

## Context

The owner decided that PenguinOps is fully open source under the MIT license and accepts that
MIT allows closed-source and commercial reuse. Third-party code, fonts, images and sounds must
not force a different license on the project. Contributions are welcome in principle.

## Decision

- Everything created in the project (code, levels, texts, docs) is licensed under **MIT**.
  `LICENSE` reads "Copyright (c) 2026 Rexi255" (the owner's GitHub name; a pseudonym is
  sufficient).
- Third-party content keeps its own license and must be on this allowlist:

| Area | Allowed without asking |
|---|---|
| Code dependencies | MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, Zlib, BlueOak-1.0.0, CC0-1.0, Python-2.0, CC-BY-4.0 |
| Fonts | SIL OFL 1.1 |
| Sounds, music, images | CC0-1.0, CC-BY-4.0 (attribution in the in-game credits and `THIRD-PARTY-LICENSES.md`) |
| Approved exceptions | Electron's bundled ffmpeg library (LGPL-2.1+, a separate DLL, unavoidable with Electron); axe-core (MPL-2.0, used only in tests, never shipped) |
| Only after asking the owner | GPL, AGPL, LGPL, MPL (except the exceptions above), CC-BY-SA, unlicensed code, custom licenses |
| Never | CC-BY-NC and other non-commercial licenses (they contradict MIT's permission of commercial use) |

- Shipped (runtime) dependencies are held to a stricter standard than development-only tools.
- The machine-readable policy for npm dependencies is [`license-policy.json`](../../license-policy.json);
  CI enforces it from milestone M0 on.
- Hand-added third-party content (fonts, images, sounds, copied code) is listed in
  `THIRD-PARTY-LICENSES.md`. License texts of npm dependencies are generated automatically for
  each release and shipped with it.
- **No DCO or CLA.** GitHub's Terms of Service (section D.6, "Contributions Under Repository
  License") already license contributions under the repository's license ("inbound=outbound").
  `CONTRIBUTING.md` states this in one sentence.

## Alternatives considered

- **Permissive-only without exceptions:** would rule out Electron (ffmpeg) and automated
  accessibility checks (axe-core), contradicting ADR 0003 and ADR 0020.
- **DCO or CLA:** extra friction with no benefit for a small project.

## Consequences

- Every new dependency or asset needs a quick license check; the CI check catches mistakes.
- Electron's own third-party notices (`LICENSES.chromium.html`) ship with the installed app.
