// The status of a file as stat(2) reports it (ADR 0055). The game stores only what a level
// author sets (owner, group, mode, mtime and the content); the other fields follow from the
// node like on an ext4 file system with 4 KiB blocks, the default of Debian 13: the size of a
// file is the number of UTF-8 bytes of its content, a directory is one block, a file takes
// whole blocks, and a directory has a link for its entry in the parent, for its `.` and for the
// `..` of each subdirectory.

import type { FsNode } from "./fs-node";
import type { Gid, Uid } from "./ids";
import { encodeUtf8 } from "./utf8";

/** The size of a block of the simulated ext4 file systems, in bytes. */
export const FILE_SYSTEM_BLOCK_SIZE = 4096;

/** The unit of `blocks` in stat(2), in bytes. */
export const STAT_BLOCK_SIZE = 512;

/** The fields of `struct stat` that the game simulates. */
export interface FileStatus {
  readonly kind: FsNode["kind"];
  /** The permission bits from 0 to 0o7777. */
  readonly mode: number;
  /** The number of hard links (`st_nlink`). */
  readonly links: number;
  readonly owner: Uid;
  readonly group: Gid;
  /** The size in bytes (`st_size`). */
  readonly size: number;
  /** The space the file takes, in units of 512 bytes (`st_blocks`). */
  readonly blocks: number;
  /** The time of the last content change, in milliseconds since the epoch. */
  readonly mtime: number;
}

/**
 * Returns the status of `node`:
 *
 * - a file has one link (the game has no hard links yet) and the size of its content in UTF-8;
 * - a directory has 2 links plus one per subdirectory and the size of one block. Real ext4
 *   directories grow by whole blocks once their entries no longer fit into the first one (a few
 *   hundred entries); the game's directories are much smaller;
 * - the blocks are the size rounded up to whole file system blocks, so an empty file takes none
 *   and a file of one byte takes 8 (4 KiB).
 */
export function fileStatus(node: FsNode): FileStatus {
  const size = node.kind === "file" ? encodeUtf8(node.content).length : FILE_SYSTEM_BLOCK_SIZE;
  return {
    kind: node.kind,
    mode: node.mode,
    links: node.kind === "file" ? 1 : 2 + subdirectoryCount(node.entries.values()),
    owner: node.owner,
    group: node.group,
    size,
    blocks: (Math.ceil(size / FILE_SYSTEM_BLOCK_SIZE) * FILE_SYSTEM_BLOCK_SIZE) / STAT_BLOCK_SIZE,
    mtime: node.mtime,
  };
}

function subdirectoryCount(entries: Iterable<FsNode>): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.kind === "directory") {
      count++;
    }
  }
  return count;
}

/** The letter of each kind of node in `ls -l` and `stat -c %A`. */
const TYPE_LETTERS: Readonly<Record<FsNode["kind"], string>> = { file: "-", directory: "d" };

/** Returns the letter that `ls -l` writes for the kind of node, such as `d` for a directory. */
export function fileTypeLetter(kind: FsNode["kind"]): string {
  return TYPE_LETTERS[kind];
}

const SETUID = 0o4000;
const SETGID = 0o2000;
const STICKY = 0o1000;

/**
 * Returns the ten characters of the mode string of `ls -l`, like gnulib's `filemodestring`
 * without its last character (the ACL flag, which `ls` drops when no file has an ACL): the type
 * letter, then `rwx` for the owner, the group and the others, with `-` for a missing bit. The
 * setuid and setgid bits show as `s` in the execute place of the owner or the group, the sticky
 * bit as `t` in that of the others; they show as `S` and `T` when the execute bit is missing.
 */
export function modeString(kind: FsNode["kind"], mode: number): string {
  return (
    fileTypeLetter(kind) +
    permissionTriple(mode >> 6, (mode & SETUID) !== 0, "s") +
    permissionTriple(mode >> 3, (mode & SETGID) !== 0, "s") +
    permissionTriple(mode, (mode & STICKY) !== 0, "t")
  );
}

/** The three letters of one class; `bits` holds the class in its lowest three bits. */
function permissionTriple(bits: number, special: boolean, specialLetter: string): string {
  const execute = (bits & 0o1) !== 0;
  let last = execute ? "x" : "-";
  if (special) {
    last = execute ? specialLetter : specialLetter.toUpperCase();
  }
  return ((bits & 0o4) !== 0 ? "r" : "-") + ((bits & 0o2) !== 0 ? "w" : "-") + last;
}
