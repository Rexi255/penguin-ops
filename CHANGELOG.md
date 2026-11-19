# Changelog

All player-visible changes are listed here, per version. Technical changes are in the git
history. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The game opens a window with a placeholder screen that shows the name and version, in the
  colours of the "Label Tape & Patch Cable" design (rack-metal ground, paper-white title).
- The game ships its own fonts and works the same on Windows and Linux: Inter for the
  interface, JetBrains Mono for the terminal and Barlow Condensed for label tape. The placeholder
  screen uses them; their licenses are in the installed app's `resources/licenses/fonts` folder.
- Windows installer wizard (choice of folder, desktop and Start menu shortcuts, uninstaller
  that keeps save games) and a Linux AppImage. No release has been published yet.
- PenguinOps logo and app icon: the installer, the app, its shortcuts and the AppImage show
  the penguin with the shell prompt instead of the default Electron icon.
