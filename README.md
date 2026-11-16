# PenguinOps

A relaxed learning game for Linux commands. You start as an intern in a company's IT
department and solve support tickets in a simulated terminal: find a lost file, clean up a full
disk, read the logs, and slowly uncover what your predecessor left behind. No time pressure, no
game over, only hints.

> **Status: in development, not playable yet.** The first version (v0.1) will contain chapters
> 0–2: navigation, reading files and tidying up. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Planned for v0.1

- A simulated Debian system with a real-feeling shell: pipes, redirection, wildcards, tab
  completion, history.
- Tickets in chapters, with incidents, review tickets and side tickets.
- Free hints, extra goals, achievements and promotions.
- Story mode and Sandbox mode (free play and a playground).
- German and English.
- Three save slots, colour schemes, keyboard-only play.

## Install (after the first release)

- **Windows:** download `PenguinOps-Setup-<version>.exe` from
  [Releases](https://github.com/Rexi255/penguin-ops/releases) and run it. The installer is not
  code-signed yet, so Windows SmartScreen may warn you: choose "More info" → "Run anyway".
- **Linux:** download the `.AppImage`, make it executable (`chmod +x PenguinOps-*.AppImage`) and
  start it.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). The project is built with
[Claude Code](https://claude.com/claude-code); [CLAUDE.md](CLAUDE.md) contains the project rules.

## License

[MIT](LICENSE). Third-party content: [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).
"Linux" is a registered trademark of Linus Torvalds; PenguinOps is not affiliated with it.
