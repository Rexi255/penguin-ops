// The player's Linux user name (ADR 0019, ADR 0093): derived from the name the player types on
// "New game", editable, and checked before a save slot is created. The checks return problem
// codes, never texts: the UI translates them.

import type { BaseWorld } from "@penguin-ops/content";

/** The longest allowed user name, like a real Linux account (ADR 0019). */
export const USER_NAME_MAX_LENGTH = 32;

/**
 * Why a user name is not allowed, in the order the checks run:
 *
 * - `empty`: there is no name;
 * - `too-long`: longer than `USER_NAME_MAX_LENGTH`;
 * - `uppercase`: contains an uppercase letter A–Z;
 * - `invalid-character`: contains a character other than a–z, 0–9 and the hyphen;
 * - `invalid-start`: does not start with a letter;
 * - `reserved`: a user or group of the simulated world already has this name.
 */
export type UserNameProblem =
  "empty" | "too-long" | "uppercase" | "invalid-character" | "invalid-start" | "reserved";

/**
 * The users and groups of Debian's `base-passwd` (`/etc/passwd` and `/etc/group` of a fresh
 * install), reserved even before a base world defines them, so that a later world with these
 * accounts never collides with an existing save (to be verified on Debian 13 in M6). Names
 * that a player cannot choose anyway, such as `_apt`, are left out.
 */
const DEBIAN_SYSTEM_ACCOUNTS: readonly string[] = [
  "root",
  "daemon",
  "bin",
  "sys",
  "sync",
  "games",
  "man",
  "lp",
  "mail",
  "news",
  "uucp",
  "proxy",
  "www-data",
  "backup",
  "list",
  "irc",
  "gnats",
  "nobody",
  "adm",
  "tty",
  "disk",
  "kmem",
  "dialout",
  "fax",
  "voice",
  "cdrom",
  "floppy",
  "tape",
  "sudo",
  "audio",
  "dip",
  "operator",
  "src",
  "shadow",
  "utmp",
  "video",
  "sasl",
  "plugdev",
  "staff",
  "users",
  "nogroup",
];

/** Letters that are written as two Latin letters, or that Unicode does not decompose. */
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  å: "aa",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

/**
 * The user name derived from the name the player typed (ADR 0093):
 *
 * 1. lowercase; ä, ö, ü, ß and a few other letters become their Latin spelling ("Jörg" →
 *    `joerg`), other accents are dropped ("Zoë" → `zoe`);
 * 2. apostrophes disappear ("O'Brien" → `obrien`);
 * 3. every run of other characters becomes one hyphen ("Anna Lena" → `anna-lena`);
 * 4. everything before the first letter and hyphens at the end are removed;
 * 5. the name is cut to `USER_NAME_MAX_LENGTH` characters, without a hyphen at the end.
 *
 * Returns an empty string if the name has no Latin letter (for example "李"); the player then
 * types the user name. Reserved names are not avoided: `checkUserName` reports them.
 */
export function deriveUserName(playerName: string): string {
  const lower = playerName.normalize("NFC").toLowerCase();
  const transliterated = Array.from(lower, (character) => TRANSLITERATIONS[character] ?? character)
    .join("")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’ʼ`´]/gu, "");
  const hyphenated = transliterated.replace(/[^a-z0-9]+/gu, "-");
  const trimmed = hyphenated.replace(/^[^a-z]+/u, "").replace(/-+$/u, "");
  return trimmed.slice(0, USER_NAME_MAX_LENGTH).replace(/-+$/u, "");
}

/**
 * The names a player cannot take: Debian's system accounts and every user and group of every
 * host of `worlds`.
 */
export function reservedUserNames(worlds: readonly BaseWorld[]): ReadonlySet<string> {
  const names = new Set(DEBIAN_SYSTEM_ACCOUNTS);
  for (const world of worlds) {
    for (const host of world.hosts) {
      for (const user of host.users) {
        names.add(user.name);
      }
      for (const group of host.groups) {
        names.add(group.name);
      }
    }
  }
  return names;
}

/**
 * The first problem of the user name `name` (ADR 0019, ADR 0093), or undefined if the player
 * can take it. `reserved` holds the names of `reservedUserNames`.
 */
export function checkUserName(
  name: string,
  reserved: ReadonlySet<string> = new Set(),
): UserNameProblem | undefined {
  if (name === "") {
    return "empty";
  }
  if (name.length > USER_NAME_MAX_LENGTH) {
    return "too-long";
  }
  if (/[A-Z]/u.test(name)) {
    return "uppercase";
  }
  if (/[^a-z0-9-]/u.test(name)) {
    return "invalid-character";
  }
  if (!/^[a-z]/u.test(name)) {
    return "invalid-start";
  }
  if (reserved.has(name)) {
    return "reserved";
  }
  return undefined;
}
