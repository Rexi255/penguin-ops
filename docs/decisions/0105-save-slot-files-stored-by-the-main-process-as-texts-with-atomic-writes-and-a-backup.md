# 0105. Save slot files stored by the main process as texts with atomic writes and a backup

- Status: Accepted
- Date: 2026-11-20
- Supersedes: –

## Context

ADR 0013 decided three save slots in Electron's per-user data folder, atomic writes and a backup
of the last good version. ADR 0104 fixed the save format in the pure gameplay package. Now the
files have to be stored: the renderer runs in Chromium's sandbox and cannot touch files
(ADR 0014), so the main process must do it behind a narrow preload API.

ADR 0006 and ADR 0033 let `apps/desktop` import only types from `apps/ui` and nothing from the
packages; the save data model and its migrations belong to `packages/gameplay`. The main process
therefore cannot parse a save without changing that boundary. On Windows, the primary platform,
a virus scanner or the search indexer can hold a file that was just written, so that renaming
over it fails for a moment.

## Decision

- **The main process stores texts.** `apps/desktop/src/main/save-store.ts` reads and writes the
  text of each slot's save without parsing it. The renderer parses, migrates and checks the texts
  with the gameplay package and decides which file of a slot to use (M3.7c).
- **Location and names.** The files are in the folder `saves` inside `app.getPath("userData")`
  (on Windows `%APPDATA%\PenguinOps\saves`): `slot-1.json` to `slot-3.json` and the backups
  `slot-1.backup.json` to `slot-3.backup.json`. The folder is created with the first save.
- **Atomic write with backup.** Saving a slot (1) copies the current save, if there is one, to
  `<backup>.tmp` and renames it over the backup, (2) writes the new text to `<save>.tmp`, flushes
  it to the disk and renames it over the save. Every file is therefore always either complete old
  or complete new; a failure in any step leaves the previous save in place. The backup is the
  save that the latest save replaced.
- **Restore.** `restoreBackup` copies the backup over the save in the same atomic way. The
  renderer calls it when the save cannot be read but the backup can, so that the broken file
  never becomes the backup.
- **Delete** removes the save, the backup and leftover temporary files of a slot, the save first.
- **One operation at a time per slot.** The store queues the operations of a slot, so that two
  autosaves never share a temporary file; a failed operation does not block the next one.
- **Retry on Windows.** A rename that fails with `EPERM`, `EACCES` or `EBUSY` is tried up to five
  times, waiting 20, 40, 80 and 160 ms; other errors fail at once.
- **Reading.** `readSlots` returns, for every slot, its save and its backup as `missing`,
  `unreadable` (a folder, a file over the limit, no access) or `text`.
- **Validation in the main process.** A slot is a whole number from 0 to 2; a save is a string of
  at most 1,048,576 UTF-16 code units. The IPC handlers check both before the store runs and
  answer only the app's own page; the store checks them again.
- **Preload API.** `DesktopApi.saves` (`SaveFilesApi` in `apps/ui/src/desktop-api.ts`) offers
  `readSlots`, `writeSlot`, `restoreBackup` and `deleteSlot` over the channels `saves:*`.
- **End-to-end tests** start the app with `--user-data-dir` set to a new empty folder for every
  test, so they never touch the saves of the person who runs them.

## Alternatives considered

- **Parse saves in the main process with the gameplay package:** the main process could validate
  every save and choose between save and backup itself, but it would break the package
  boundaries of ADR 0006 and ADR 0033 for logic the renderer runs anyway. Size and slot checks
  keep the files safe from a misbehaving renderer.
- **Back up a save only when it parses:** needs the parser in the main process (see above). The
  explicit restore gives the same protection: the renderer never writes over a good backup while
  the save is broken.
- **One file per slot with several versions inside:** a damaged file would lose every version at
  once.
- **Write the file in place:** a crash in the middle leaves a half-written save.
- **Electron's `safeStorage` or a database:** saves are not secret, and a database is a large
  dependency for three small JSON files that players should be able to back up by hand.

## Consequences

- M3.7c reads the slots at the start, chooses save or backup, restores and migrates where needed,
  and writes autosaves through `writeSlot`; it handles a rejected promise as a failed save.
- M3.7d adds export and import through the same validation rules.
- The slot count exists twice, in the main process and in the UI; the UI checks that the number
  of slots it reads matches its own.
