# 0055. ls long format with a simulated file status on UTC hosts

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ROADMAP M1.8b-2 adds `ls -l` to the `ls` of ADR 0054. The long format shows fields that the
world model (ADR 0041) does not store: the number of links, the size in bytes and the blocks
that the `total` line adds up. It also shows dates, and dates depend on a time zone, which the
simulated hosts did not have yet. The game stores times in milliseconds since the epoch, UTC.

As for ADR 0054, the implementation follows the source code of coreutils 9.7 (`src/ls.c`:
`gobble_file`, `print_long_format`, `format_user_or_group`, `print_dir`) and gnulib
(`filemodestring`, `human_readable`, `nstrftime`).

## Decision

- **The simulated hosts run on UTC**, like a freshly installed Debian server image. Dates show
  the same on every player's machine and have no daylight saving time. The owner chose UTC over
  `Europe/Berlin`. `src/calendar.ts` turns a game time into a UTC date with plain arithmetic
  (`utcCalendarTime`), for every safe integer.
- **The file status follows from the node** like on ext4 with 4 KiB blocks, the default of
  Debian 13 (`src/file-status.ts`, `fileStatus`):
  - a file has one link (no hard links yet) and the size of its content in UTF-8 bytes;
  - a directory has 2 links plus one per subdirectory and a size of 4096 bytes;
  - blocks (`st_blocks`, units of 512 bytes) are the size rounded up to whole 4 KiB blocks: an
    empty file takes none, a file of one byte 4 KiB.
  - `modeString` writes gnulib's mode string without the ACL character: `s`/`S` for setuid and
    setgid, `t`/`T` for the sticky bit.
- **`openDirectory` returns entries with their kind** (`DirectoryEntry`: name and `file` or
  `directory`), like `d_name` and `d_type` of readdir(3), so `ls` knows the type of an entry
  that it cannot stat.
- **`ls` simulates `-l`, `-g`, `-o`, `-G`/`--no-group` and `-n`/`--numeric-uid-gid`.** `-l`,
  `-g`, `-o` and `-n` select the long format, which `-1` does not undo; `-g` leaves out the
  owner, `-o` and `-G` the group, `-n` shows IDs. `-G` alone changes nothing.
- **The long format** (`src/commands/long-listing.ts`) writes per file: mode string, links,
  owner, group, size, time, name, separated by one space. Links and sizes are aligned to the
  right, names of owners and groups to the left; an ID without a user or group (and every ID
  with `-n`) to the right. Each column is as wide as its widest value among the files that `ls`
  gathered for the listing. For the operands these are all operands that `ls` could access,
  also the directories that it lists later.
- **Times** use the English locale's default formats: `%b %e %H:%M` (`Nov 17 22:46`) for a
  recent time, else `%b %e  %Y` (`Jan  5  2025`). A time is recent if it is more than half a
  Gregorian year (15,778,476 seconds) before the game time and not after it. Unlike Linux, an
  mtime equal to the game time counts as recent: in the game a command and the files it
  changed share the time of the input, while the real `ls` reads the clock after earlier
  commands wrote their files.
- **Directory listings** start with `total N`, the blocks of the listed files in KiB, rounded
  up, also `total 0` for an empty directory and for a working directory that was removed.
  File operands get no `total` line.
- **Entries that `ls` cannot stat** (a directory with read but without search permission):
  each gives `ls: cannot access 'DIR/NAME': Permission denied` in the order of readdir(3)
  before the listing and exit status 1 unless it is already 2; the entry is still listed as
  `-????????? ? ? ? ?            ? NAME`, with its type letter from readdir(3). Such entries do
  not count for the widths and the total.
- On a terminal, names are quoted and aligned with a leading space as in columns (ADR 0054).
- In the long format, `TIME_STYLE`, `TZ`, `LS_BLOCK_SIZE`, `BLOCK_SIZE` and `BLOCKSIZE` stop the
  input with the notice `variable-not-simulated`, like `TABSIZE` in columns.

## Alternatives considered

- **`Europe/Berlin` as the time zone:** it fits the story's German company, but times would
  jump with daylight saving time and level authors would have to think about two offsets. The
  owner chose UTC.
- **Store size, links and blocks in the world:** level authors could set values that
  contradict the content and the tree. Deriving them keeps the world consistent.
- **Size directories by their entries like ext4:** real directories grow by 4 KiB once their
  entries no longer fit into the first block, and htree indexing changes the sizes again. The
  game's directories hold far fewer entries than that limit, so 4096 is exact for them.
- **Treat an mtime equal to the game time as in the future, like `ls.c` would:** `touch f; ls
  -l f` in one input would show the year instead of the time, which never happens on Linux.
- **Measure the columns of file operands only over the files:** simpler, but not what `ls.c`
  does, so `ls -l file dir` would align differently from Linux.

## Consequences

- `stat`, `du`, `find -size` and `touch` can use `fileStatus` and `utcCalendarTime` later.
- A level that needs another time zone needs a new decision and a `TZ` simulation.
- `POSIXLY_CORRECT` changes the unit of `total` and the option order of all commands; the game
  ignores it for now (ROADMAP ideas).
- Tests whose details could not be checked against a real Debian 13 carry `@differential`:
  the widths of file operands next to directory operands, the order of the messages for
  entries that cannot be stat'ed, and years outside 1000 to 9999.
