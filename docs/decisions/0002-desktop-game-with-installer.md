# 0002. Ship a desktop game with a real installer

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The prototype was a single HTML file in a browser. The owner wants a "real game" like the ones
on Steam: an `.exe` with an installer, its own window, a polished game-like UI with menus,
settings, sound and effects. The owner uses Windows; Linux is a second target. The owner is
the first and main player; others may play later.

## Decision

- PenguinOps is a desktop game with a graphical UI (own window, fullscreen by default).
- **Windows** is the primary platform: an NSIS installer wizard (choice of install folder,
  Start menu entry, desktop shortcut, uninstaller).
- **Linux** is the secondary platform: an AppImage (single file, runs without installation on
  most distributions).
- macOS is not officially supported.
- Releases are built by CI and published on GitHub Releases.
- Builds are not code-signed for now. The Windows SmartScreen warning is accepted. Free code
  signing for open-source projects (SignPath Foundation) is an option if the game is ever
  distributed widely.
- **Steam:** maybe later; nothing is built for it now (assumed from the owner's answer, not
  explicitly confirmed). If it happens: Steam Direct costs USD 100 per game; the Steamworks
  SDK is not open source, its redistributable library may ship with the game, but the SDK must
  not be committed to the public repository.
- **Web version:** possible later for the owner's own server, built from the same frontend as
  static files. Not on the roadmap.

## Alternatives considered

- **Terminal UI (TUI) in a real console window:** authentic, but no music, no effects, no own
  window, poor screen reader support. Rejected.
- **`.deb` package for Linux:** only Debian and Ubuntu; AppImage covers more systems.
- **Browser-only game:** no installer, browser shortcuts (Ctrl+W, Ctrl+R) conflict with
  terminal habits.

## Consequences

- Packaging, installer and release automation are part of the work (milestones M0 and M5).
- Unsigned builds show a warning on first start; the player README explains it.
