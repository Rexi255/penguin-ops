# 0032. License check from the lockfile

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

ADR 0005 requires that every npm dependency has a license from the allowlist in
`license-policy.json`, with a stricter standard for shipped (runtime) packages than for
development tools. ADR 0031 adds `lightningcss` and its platform packages as exceptions that
are valid only in development scope. ROADMAP M0.5 needs a tool that enforces this as an npm
script. Requirements:

- The same result on Windows and Linux. npm installs only the platform binaries of the current
  machine (for example `lightningcss-win32-x64-msvc`), so a check of `node_modules` would see
  different packages on each platform.
- Licenses are SPDX expressions such as `(MIT OR Apache-2.0)` or `MIT AND ISC`, not only
  single identifiers.
- Each package must be classified as development-only or shipped.

## Decision

- **Our own small checker in `scripts/license-check/`**, run by `npm run check:licenses`
  (`scripts/check-licenses.ts`). It has no third-party dependencies.
- **Source of truth is `package-lock.json`** (lockfile version 2 or 3). It lists every package
  for every platform, including optional platform binaries that are not installed, together
  with the license npm read from the package. The root package, the workspaces and links to
  them are skipped; they are our own MIT code.
- **Scope:** a package counts as "development" only when npm marks it `dev: true`, which means
  no runtime dependency reaches it. Everything else, including `devOptional`, counts as
  "runtime", the stricter case.
- **SPDX expressions** are parsed with the usual precedence (`WITH` before `AND` before `OR`).
  `OR` needs one accepted side, `AND` needs both. A license with an exception
  (`X WITH Y`) is its own term and must be allowed as a whole.
- **Policy evaluation:** a term is accepted when it is in `allowed`, or when an exception
  matches the package name (with `*` as a wildcard), the license and the scope. Exceptions
  currently support only `"scope": "development"`; the policy file is validated strictly and
  unknown fields are errors.
- **Failures:** a package without a license, with an invalid SPDX expression, with a forbidden
  or an "ask first" license, with a license that is allowed only for development tools but is
  shipped, or with any other license fails the check. The script lists every violation with
  name, version, scope and reason and exits with code 1. Unused exceptions are not errors,
  because exceptions such as axe-core are approved before the package is installed.
- The checker is tested with Vitest in the `tooling` project, including a test that the
  repository's own lockfile and policy pass.

## Alternatives considered

- **`license-checker-rseidelsohn` or similar tools:** they read the installed `node_modules`,
  so the result depends on the platform, and they do not know our scope rules or wildcard
  exceptions. A wrapper around them would be as much code as the checker itself.
- **`spdx-expression-parse` and `spdx-satisfies`:** correct, but the expressions in practice
  are simple, and a parser of about 100 lines with tests avoids extra dependencies in the
  tooling.
- **Reading each package's `package.json` from `node_modules`:** same platform problem as
  above, and slower.

## Consequences

- A new dependency with a license outside the policy fails `npm run check:licenses` (and
  `npm run check` from ROADMAP M0.6 on) before it can be committed.
- The check trusts the license field that npm stores in the lockfile. Packages that declare a
  wrong license in their `package.json` are not detected; this is the same limit every
  npm-based checker has.
- Supporting an exception for shipped packages (for example a future runtime exception) needs
  a new scope value, a change of the checker and a new decision record.
