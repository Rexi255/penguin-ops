# 0003. Tech stack: TypeScript, React and Electron

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

Requirements: a desktop game with installer and polished UI (ADR 0002); a text- and
terminal-centred game; the whole code is written by AI, the owner only reviews and has no
experience with Rust or TypeScript; strong automatic checks are the main safety net; the
prototype exists as HTML/CSS/JavaScript.

Reference games researched on 2026-11-16:

| Game | Genre | Technology |
|---|---|---|
| The Farmer Was Replaced | Program a farm drone in a Python-like language | Unity |
| World of Haiku | Cyberpunk RPG with a simulated Linux environment | Unity |
| Bitburner | Terminal and scripting game, open source | TypeScript/React; Steam build is Electron |
| Hacknet | Hacking game in a fake terminal | C# with XNA/FNA |

Pattern: games with large 2D/3D worlds use game engines; terminal- and text-centred games use
web technology or draw their own UI.

## Decision

- **Language:** TypeScript in strict mode everywhere.
- **UI:** React with HTML/CSS.
- **Desktop shell:** Electron.
- **Build:** Vite via electron-vite.
- **Packaging:** electron-builder (NSIS installer for Windows, AppImage for Linux).
- **Repository:** npm workspaces (see ADR 0006), npm as package manager, Node.js LTS pinned.
- **Key libraries:** zod (schemas), a YAML parser, intl-messageformat (ICU messages), Vitest,
  Testing Library, Playwright, ESLint, Prettier.

Reasons:

1. The core of the game is text: terminal, tickets, explanations, mails. HTML/CSS is the
   strongest technology for that, and the prototype's design and logic can be reused.
2. Claude can check its own UI: Playwright takes screenshots in cloud sessions (Chromium is
   available there), and screenshot comparison tests catch unwanted visual changes. With a game
   engine Claude would work mostly blind on visuals.
3. TypeScript is the language AI writes most reliably. Strict mode plus the ESLint rule
   `switch-exhaustiveness-check` gives exhaustive-case checking similar to Rust's `match`.
4. Electron needs only Node.js on the owner's Windows machine, renders identically on Windows
   and Linux (it bundles Chromium) and is proven for games on Steam (Bitburner).

## Alternatives considered

- **Tauri:** much smaller installer, but needs the Rust toolchain plus C++ build tools on the
  owner's machine, renders with a different web engine on Linux (WebKitGTK), and its v2
  configuration is error-prone for AI. Its build tooling also pulls in MPL-2.0 crates.
- **Godot 4:** best game feel out of the box (shaders, particles, audio) and a visual editor,
  but Claude would work mostly blind on visuals, GDScript is less reliable for AI, and AI
  models often mix up Godot 3 and 4 APIs.
- **Unity:** proprietary engine, does not fit an MIT open-source project, hard to build in CI.
- **Rust with a terminal UI (ratatui):** strictest compiler, but cannot deliver the required
  game-like UI (see ADR 0002).
- **Go (Bubble Tea) or Python (Textual):** terminal UIs only; Python is hard to distribute on
  Windows and checks less at build time.

## Consequences

- Installer size about 80–120 MB and higher memory use than Tauri; normal for a game.
- Game feel (animations, sound, effects) must be built by hand.
- Electron must be updated regularly because it carries Chromium security fixes (Dependabot,
  ADR 0016).
- One language for engine, game logic and UI keeps tooling simple.
