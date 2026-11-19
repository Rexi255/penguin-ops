# 0090. Content bundled into the renderer and UI texts checked against the keys the UI uses

- Status: Accepted
- Date: 2026-11-19
- Supersedes: –

## Context

ROADMAP M3.1a builds the first real screen, the start screen. Its texts must come from
`content/ui/<language>.yaml` (ADR 0012, the UI rules), but until now the app loaded no content
at all: only the content tests read `content/` from disk (ADR 0078). ADR 0006 runs engine,
content and gameplay in the renderer, which has no file system access (ADR 0014); ADR 0071
named "the Electron main process" as a possible caller of `loadContent`, without deciding how
the content reaches the game. ADR 0071 also left open which keys the UI needs and which values
it passes to UI texts with placeholders. The game's language is the operating system's locale
until the settings of M3.8 exist (ADR 0012).

## Decision

- **Bundled at build time:** the renderer imports every `.yaml` file below `content/` as text
  with Vite's `import.meta.glob` (`apps/ui/src/content/bundled-content.ts`) and loads it at start
  with `loadContent`, with every check the content tests run. A problem stops the start with a
  `ContentLoadError` that lists every problem; the content tests find it first.
- **One way to sort content files:** `sortContentFiles` in `packages/content` sorts files by
  their path from the repository root (`content/...`) into the inputs of `loadContent` and
  reports files that are not content. The content tests (reading from disk) and the app
  (reading from the bundle) both use it.
- **zod without compiled validators in the app:** the renderer sets zod's `jitless` option
  before loading, because zod's probe for `new Function` is reported as a violation of the
  strict Content Security Policy (ADR 0014) even though zod catches it.
- **Language:** `languageForLocale` gives German for a locale that starts with `de` and English
  otherwise (ADR 0012). The renderer reads `navigator.language`, which Electron sets to the
  app's locale (the system's, or Chromium's `--lang` switch); the document's `lang` attribute
  is set to the chosen language.
- **UI text keys:** `UI_TEXT_PLACEHOLDERS` in `apps/ui/src/texts/ui-texts.ts` lists every key
  the UI uses with the names of the values it passes. TypeScript requires exactly these values
  at every call, and a test checks that the English and German catalogs hold exactly these keys
  with exactly these placeholders, so no text is missing, left over or waiting for a value.
- **Drawing texts:** `createTexts` gives each text as rich text (with markup, ADR 0073) or as
  plain text for attributes; `InlineText` draws a one-paragraph text with `<code>`, `<strong>`
  and `<br>`, never as HTML. A plain or inline text of more than one paragraph is an error.
  Components get the texts through a React context (`TextsProvider`, `useTexts`).
- **Quit:** the desktop API (ADR 0033) gets `quit()`, a one-way IPC message that the main
  process accepts only from the app's own page, like `getAppInfo`. The renderer calls it without
  arguments, because the context bridge cannot pass DOM objects such as a click event.
- **Component tests:** UI components are tested with Testing Library (ADR 0003) in jsdom
  (`// @vitest-environment jsdom` per test file); tests that need no document keep Node.js.

## Alternatives considered

- **The main process reads `content/` and sends it over IPC:** the files could be replaced after
  installation, but it needs a new IPC channel with input checks, the content as extra files of
  the installer and a second way to run the game in browser tests. The game has no mods or
  content updates planned; a new version of the content is a new version of the game.
- **Precompiled content (JSON generated at build time):** saves parsing at start, but needs a
  build step and a second format, while the content is small and loads in milliseconds.
- **Load only the UI catalogs:** less work at start, but the game needs the levels soon (M3.5),
  and checking all content at once keeps one loading path.
- **Keys as plain strings without a list:** a typo or a missing text would only show in the
  running game; the list makes both a compile error or a failing test.
- **happy-dom instead of jsdom:** faster, but jsdom is the environment Testing Library is
  documented and most used with; speed does not matter at the current number of component
  tests.

## Consequences

- Every content change needs a new build of the app; `npm run dev` reloads it with the
  development server.
- The renderer bundle contains the YAML parser, zod and the whole content; it grows with every
  level.
- A new UI text needs its key in `UI_TEXT_PLACEHOLDERS` and in both catalogs, in the same
  commit.
- The end-to-end tests start the app with a fixed locale (`--lang`, default `en-US`), so they
  do not depend on the language of the machine they run on.
- Translated screenshots and the language setting follow in M3.15 and M3.8.
