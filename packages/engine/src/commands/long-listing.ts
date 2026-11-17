// The long format of `ls -l` (ADR 0055), following `print_long_format` and `gobble_file` in
// coreutils 9.7's `src/ls.c`: one line per file with the mode string, the number of links, the
// owner, the group, the size, the time of the last change and the name. The columns are as
// wide as their widest value among the files of one listing; numbers are aligned to the right,
// names to the left. A file that `ls` could not stat(2) gets a `?` in every column.

import { utcCalendarTime } from "../calendar";
import { displayWidth } from "../display-width";
import { type FileStatus, fileTypeLetter, modeString, STAT_BLOCK_SIZE } from "../file-status";
import type { FsNode } from "../fs-node";
import { findGroupByGid, findUserByUid, type Host } from "../world";

/** Which columns the long format shows (`-g`, `-o`, `-G`) and how (`-n`). */
export interface LongStyle {
  readonly owner: boolean;
  readonly group: boolean;
  /** Whether owners and groups are shown as IDs instead of names (`-n`). */
  readonly numericIds: boolean;
}

/** A file of a long listing. */
export interface LongEntry {
  /** The name as `ls` writes it, already quoted. */
  readonly text: string;
  /** The kind of node, which `ls` knows from readdir(3) even if stat(2) fails. */
  readonly kind: FsNode["kind"];
  /** The status of the file, or `undefined` if stat(2) failed. */
  readonly status: FileStatus | undefined;
}

/** Where the files of a listing are and when the listing is written. */
export interface LongContext {
  /** The host whose users and groups name the owners. */
  readonly host: Host;
  readonly style: LongStyle;
  /** The game time when `ls` runs, in milliseconds since the epoch. */
  readonly now: number;
}

/** The unit of the sizes in the `total` line: KiB, without `BLOCK_SIZE` and `POSIXLY_CORRECT`. */
const OUTPUT_BLOCK_SIZE = 1024;

/** Half a Gregorian year of 365.2425 days, in milliseconds (`31556952 / 2` seconds in `ls.c`). */
const SIX_MONTHS = 15_778_476_000;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** The width of a time in the default format (`long_time_expected_width`), for a `?`. */
const TIME_WIDTH = 12;

/** The widths of the columns, measured over the files that `ls` could stat(2). */
interface ColumnWidths {
  readonly links: number;
  readonly owner: number;
  readonly group: number;
  readonly size: number;
}

/**
 * Returns the lines of `entries` in the long format. The widths of the columns are measured
 * over `measured`, the statuses of all files that `ls` gathered for this listing: for the
 * operands these are also the directories, which are listed later (ADR 0055).
 */
export function formatLongListing(
  entries: readonly LongEntry[],
  measured: readonly (FileStatus | undefined)[],
  context: LongContext,
): string {
  const widths = measureColumns(measured, context);
  return entries.map((entry) => longLine(entry, widths, context)).join("");
}

/**
 * The `total` line of a directory listing: the blocks of all listed files that `ls` could
 * stat(2), in KiB, rounded up.
 */
export function totalLine(statuses: readonly (FileStatus | undefined)[]): string {
  let blocks = 0;
  for (const status of statuses) {
    blocks += status?.blocks ?? 0;
  }
  return `total ${String(Math.ceil((blocks * STAT_BLOCK_SIZE) / OUTPUT_BLOCK_SIZE))}\n`;
}

function measureColumns(
  measured: readonly (FileStatus | undefined)[],
  context: LongContext,
): ColumnWidths {
  let links = 0;
  let owner = 0;
  let group = 0;
  let size = 0;
  for (const status of measured) {
    if (status === undefined) {
      continue;
    }
    links = Math.max(links, String(status.links).length);
    owner = Math.max(owner, displayWidth(ownerLabel(status, context).text));
    group = Math.max(group, displayWidth(groupLabel(status, context).text));
    size = Math.max(size, String(status.size).length);
  }
  return { links, owner, group, size };
}

/** One line of the long format, like `print_long_format`. */
function longLine(entry: LongEntry, widths: ColumnWidths, context: LongContext): string {
  const { status } = entry;
  const mode =
    status === undefined
      ? fileTypeLetter(entry.kind) + "?".repeat(9)
      : modeString(status.kind, status.mode);
  let line = `${mode} ${padStart(status === undefined ? "?" : String(status.links), widths.links)} `;
  if (context.style.owner) {
    line += idColumn(status, ownerLabel, widths.owner, context);
  }
  if (context.style.group) {
    line += idColumn(status, groupLabel, widths.group, context);
  }
  line += `${padStart(status === undefined ? "?" : String(status.size), widths.size)} `;
  line += status === undefined ? padStart("?", TIME_WIDTH) : formatTime(status.mtime, context.now);
  return `${line} ${entry.text}\n`;
}

/**
 * The owner or group column, like `format_user_or_group`: a name (or the `?` of a failed
 * stat(2)) aligned to the left and followed by at least one space, an ID without a name aligned
 * to the right and followed by one space.
 */
function idColumn(
  status: FileStatus | undefined,
  label: (status: FileStatus, context: LongContext) => IdLabel,
  width: number,
  context: LongContext,
): string {
  if (status === undefined) {
    return padEnd("?", width) + " ";
  }
  const { text, named } = label(status, context);
  return (named ? padEnd(text, width) : padStart(text, width)) + " ";
}

/** How an owner or a group is shown: its name, or its ID if `named` is false. */
interface IdLabel {
  readonly text: string;
  readonly named: boolean;
}

/** The owner's user name, or the UID if `-n` is given or the UID has no user. */
function ownerLabel(status: FileStatus, context: LongContext): IdLabel {
  const user = context.style.numericIds ? undefined : findUserByUid(context.host, status.owner);
  return user === undefined
    ? { text: String(status.owner), named: false }
    : { text: user.name, named: true };
}

/** The group's name, or the GID if `-n` is given or the GID has no group. */
function groupLabel(status: FileStatus, context: LongContext): IdLabel {
  const group = context.style.numericIds ? undefined : findGroupByGid(context.host, status.group);
  return group === undefined
    ? { text: String(status.group), named: false }
    : { text: group.name, named: true };
}

/**
 * The time of the last change in the default format of the English locale, in UTC: `%b %e
 * %H:%M` for a recent time, else `%b %e  %Y`. A time is recent if it is less than six months
 * old and not in the future. `ls` reads the clock after earlier commands changed their files,
 * so a time equal to the game time counts as past (ADR 0055).
 */
function formatTime(mtime: number, now: number): string {
  const recent = now - SIX_MONTHS < mtime && mtime <= now;
  const time = utcCalendarTime(mtime);
  const date = `${MONTHS[time.month - 1] ?? ""} ${String(time.day).padStart(2, " ")}`;
  if (recent) {
    return `${date} ${twoDigits(time.hour)}:${twoDigits(time.minute)}`;
  }
  return `${date}  ${formatYear(time.year)}`;
}

/** The year like `%Y`: at least four digits, with a minus sign before a year before 1 BC. */
function formatYear(year: number): string {
  const digits = String(Math.abs(year)).padStart(4, "0");
  return year < 0 ? `-${digits}` : digits;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** `text` with spaces before it up to `width` terminal cells. */
function padStart(text: string, width: number): string {
  return " ".repeat(Math.max(0, width - displayWidth(text))) + text;
}

/** `text` with spaces after it up to `width` terminal cells. */
function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}
