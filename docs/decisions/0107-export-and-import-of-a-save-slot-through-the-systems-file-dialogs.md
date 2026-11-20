# 0107. Export and import of a save slot through the system's file dialogs

- Status: Accepted
- Date: 2026-11-20
- Supersedes: –

## Context

ADR 0013 promises export and import per slot as a file, for backups and for moving a game to
another PC. ADR 0105 stores the slot files as texts in the main process, and ADR 0106 put a menu
next to every slot that already holds Delete. The owner chose that export and import live in that
menu too. The renderer cannot show a file dialog or touch a file the player chooses (ADR 0014),
and the main process does not parse saves (ADR 0105).

## Decision

- **Menu entries.** A slot with a game offers Export, Import and Delete; a locked slot Import and
  Delete; an empty slot Import. Every slot therefore has its menu button.
- **Export.** The renderer sends the save's text (`serializeSave` of the slot's game), the
  suggested file name `penguin-ops-slot-<number>-<user name>.json` and the dialog's title and file
  type name in the player's language (`DesktopApi.saves.exportSave`). The main process
  (`apps/desktop/src/main/save-transfer.ts`) checks the request (texts of 1 to 200 characters, a
  file name of lowercase letters, digits and hyphens ending in `.json`, a save text within the
  store's limit), shows the system's save dialog in the player's documents folder with a `json`
  filter and writes the text to the chosen file. It answers `saved` or `canceled`.
- **Import.** The renderer sends the dialog's texts (`importSave`); the main process shows the
  system's open dialog with the same filter and reads the chosen file with the store's limits
  (`missing`, `unreadable` or `text`), or answers `canceled`. The renderer reads the text like a
  slot's save (`readImport`): a file that cannot be read, is no save, is damaged, comes from a
  newer version or has a user name the worlds reserve is refused with a message, and the slot
  stays as it was. A readable game is fitted to the content.
- **Replacing a save.** An import into an empty slot is written at once. An import into a slot
  with a game or a locked save first asks in an alert dialog ("Replace slot 1?") that names both
  players; Cancel has the focus. The imported game keeps its play time and last played time.
- **Messages.** The slot screen's status line says what happened: exported, could not be
  exported, imported, or why the import failed and that the slot is unchanged. A canceled dialog
  says nothing. Every failure is logged.
- **Tests** replace Electron's dialogs in the main process from the end-to-end tests, because
  Playwright cannot operate a native dialog.

## Alternatives considered

- **An export code to copy, as in the prototype:** a browser artifact needed it; a desktop game
  has files, and a code is awkward to move between PCs.
- **Main process writes the slot's stored file instead of the renderer's text:** the slot screen
  shows the game the renderer read (fitted to the content, perhaps from the backup); exporting
  exactly that game is what the player sees.
- **Import straight into the slot file in the main process:** it would need the save format in the
  main process (ADR 0105) and could not ask before it replaces a game.
- **Choose the file before or after the question:** asking after the file is chosen lets the
  question name the imported game, and a canceled dialog needs no question at all.
- **Dialog texts in the main process:** every player-facing text comes from the UI catalogs; the
  main process has no catalogs, so the renderer passes them.

## Consequences

- The save files are plain JSON that players can keep and move; a file from a newer game version
  is refused instead of misread.
- The main process trusts only checked requests and never parses an imported file.
- A later "import as new game" or drag and drop of save files would build on the same reading.
