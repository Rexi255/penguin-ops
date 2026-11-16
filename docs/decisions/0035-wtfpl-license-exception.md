# 0035. License exception for truncate-utf8-bytes (WTFPL)

- Status: Accepted
- Date: 2026-11-17
- Supersedes: [0005](0005-mit-license-and-dependency-allowlist.md) (only the list of approved
  exceptions)

## Context

electron-builder (ADR 0003, ADR 0034) depends indirectly on `truncate-utf8-bytes`
(`electron-builder` → `app-builder-lib` → `builder-util` → `sanitize-filename`), which is
licensed under the WTFPL. The WTFPL is not on the allowlist of ADR 0005, so the license check
(ADR 0032) fails. The WTFPL is a very permissive license: it allows any use without conditions.
The package runs only while electron-builder packages the app and is not part of the shipped
game.

## Decision

- The owner approved `truncate-utf8-bytes` as an exception under the WTFPL with **development
  scope**: it may be used by build tools, but must not become a runtime dependency of the
  shipped app.
- The exception is recorded in `license-policy.json` like the existing exceptions. The WTFPL is
  not added to the general allowlist.
- Everything else in ADR 0005 stays unchanged.

## Alternatives considered

- **Adding the WTFPL to the allowlist:** would also allow it for runtime dependencies without a
  new decision.
- **Another packaging tool (for example Electron Forge):** contradicts ADR 0003 for a dependency
  that is never shipped.

## Consequences

- The license check accepts this package only in development scope.
- If the package ever becomes a runtime dependency, the owner has to decide again.
