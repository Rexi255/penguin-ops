# Contributing

Thanks for your interest in PenguinOps! This is a small hobby project, built with Claude Code
and maintained by [Rexi255](https://github.com/Rexi255). Contributions are welcome, but please
open an issue first for anything bigger than a typo, so we can agree on the approach.

## License of contributions

PenguinOps is licensed under the [MIT License](LICENSE). By contributing, you agree that your
contribution is licensed under the same terms (GitHub Terms of Service, section D.6,
"inbound=outbound"). No CLA or DCO sign-off is needed.

## Setup

Requirements: Node.js 26 LTS (pinned in `.nvmrc` and in `engines` of `package.json`; `npm install`
refuses other versions), Git. Works on Windows and Linux. In VS Code, install the recommended
extensions when prompted (ESLint, Prettier, Playwright, YAML, EditorConfig; listed in
`.vscode/extensions.json`).

The code skeleton is being built in milestone M0. Commands (defined in `package.json`; the
ones marked "planned" do not exist yet):

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run typecheck` | Type-check all workspaces (`tsc --build`) |
| `npm run dev` | Start the game in development mode (planned) |
| `npm run check` | Format check, lint, type check, all tests, license check (planned) |
| `npm run e2e` | End-to-end and screenshot tests (planned) |
| `npm run package` | Build the installer (planned) |

## Workflow

The maintainer and Claude Code commit directly to `main`
([ADR 0027](docs/decisions/0027-work-directly-on-main.md)). Outside contributors use a fork
and a pull request:

1. One pull request per change.
2. Commit messages and pull request titles follow
   [Conventional Commits](https://www.conventionalcommits.org/) in English, e.g.
   `feat: add wc command`, `fix: ls -l column width`, `docs: update roadmap`.
3. `npm run check` must pass; CI runs the same checks on Linux and Windows.
4. Update the documentation in the same pull request: at least `docs/STATUS.md` when code or
   content changes (CI checks this), plus the other documents listed in `CLAUDE.md` under
   "Documentation duty" when affected.
5. Visual changes need before/after screenshots in the pull request description.
6. Pull requests are merged as a single squash commit.

Never weaken checks to get CI green (no skipped tests, no relaxed lint rules, no lowered
coverage).

## Code

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the code conventions in
  [CLAUDE.md](CLAUDE.md).
- Everything in the repository is written in English, except the German translation files.
- The engine and gameplay packages must stay pure and deterministic (no DOM, Node APIs, file
  system, network, real time or `Math.random()`).
- New behaviour needs tests, including error cases.

## Contributing levels

1. Read [docs/LEVEL-AUTHORING.md](docs/LEVEL-AUTHORING.md), [docs/CURRICULUM.md](docs/CURRICULUM.md)
   and [docs/STORY.md](docs/STORY.md).
2. A level is a folder `content/levels/<level-id>/` with `level.yaml`, `de.yaml` and `en.yaml`.
   German and English are both required.
3. Levels contain data only, never code. If a check cannot be expressed with the existing rule
   types, propose a new rule type in an issue.
4. Every level needs at least one reference solution; the tests prove it solvable in every
   language.
5. Inside the simulated world, names, paths, commands, configs and logs are English; only prose
   written by people in the story (notes, mails) is translated.
6. Fit the curriculum (no commands from later chapters) and the story's tone and glossary.

## Translations

- A new language needs `content/ui/<lang>.yaml` and a `<lang>.yaml` in each level folder.
- Additional languages may be incomplete; missing texts fall back to English. German and
  English must always be complete.
- Do not translate anything inside the simulated Linux world (names, paths, commands, output).
- Use the glossary in [docs/STORY.md](docs/STORY.md) for consistent terms.

## Third-party content

Only add dependencies, fonts, images, sounds or code whose license is allowed by
[ADR 0005](docs/decisions/0005-mit-license-and-dependency-allowlist.md) and
[license-policy.json](license-policy.json). Record hand-added content in
[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

## Reporting bugs

Open an issue with the game version, operating system, language, the steps to reproduce and
what you expected.

Please be kind and constructive in all discussions.
