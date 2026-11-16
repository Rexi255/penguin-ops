# 0014. Electron security baseline, offline, no telemetry

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

Electron apps can be insecure if the UI process gets access to Node.js. A learning game needs
no internet access, and the owner wants no tracking.

## Decision

- **Security baseline:** context isolation on, renderer sandboxed, no Node integration in the
  renderer, a strict Content Security Policy, no remote content (all code and assets are
  bundled), no opening of external URLs from game content.
- **Narrow preload API:** the renderer can only call a small, typed set of functions (load and
  save slot, load and save settings, export and import a slot file, window controls). Every
  input from the renderer is validated in the main process.
- **Offline:** the game works fully offline and makes no network requests.
- **No telemetry** and no crash reporting to external services.
- No auto-updater for now (idea for later; it would need network access).

## Alternatives considered

- **Electron defaults without hardening:** a bug in the UI could reach the player's real files.
- **Optional telemetry:** not needed for a learning game; privacy first.

## Consequences

- File access is concentrated in the small main-process module, which is easy to review and
  test.
- New native features always need an explicit, validated preload function.
