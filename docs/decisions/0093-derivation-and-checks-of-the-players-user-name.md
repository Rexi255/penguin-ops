# 0093. Derivation and checks of the player's user name

- Status: Accepted
- Date: 2026-11-19
- Supersedes: –

## Context

ADR 0019 decided that the name the player types on "New game" becomes a Linux user name,
derived automatically ("Jörg" → `joerg`) and editable, with the rules of real Linux accounts:
lowercase letters, digits and hyphens, starting with a letter, at most 32 characters. It left
open how a name with several words, accents, apostrophes or no Latin letter at all is derived,
and which names a player may not take. `levelWorldSpec` already refuses a name that is a user
or group of a host, but only when a level starts; the new game screen (ROADMAP M3.2b) must
reject such a name before a save slot is created, and must tell the player why in their
language.

## Decision

- The derivation (`deriveUserName` in `packages/gameplay/src/user-name.ts`) uses the whole
  name, not only the first word ("Jörg Müller" → `joerg-mueller`):
  1. lowercase; ä, ö, ü and ß become `ae`, `oe`, `ue` and `ss`, a few letters that Unicode does
     not decompose get a fixed Latin spelling (æ, œ, ø, å, ł, đ, ð, þ, ı), and all other
     accents are dropped after Unicode decomposition (NFD) ("Zoë" → `zoe`);
  2. apostrophes are removed ("O'Brien" → `obrien`);
  3. every run of other characters becomes one hyphen;
  4. everything before the first letter and hyphens at the end are removed ("007 Bond" →
     `bond`);
  5. the result is cut to 32 characters, without a hyphen at the end.
- A name without a Latin letter ("李") derives an empty user name; the player types one.
- The check (`checkUserName`) returns the first problem as a code, never as a text: `empty`,
  `too-long`, `uppercase`, `invalid-character`, `invalid-start`, `reserved`. The UI translates
  the codes. `isValidPlayerName`, which `levelWorldSpec` uses, is the same check without
  reserved names, so there is only one set of rules.
- Reserved names (`reservedUserNames`) are every user and group of every host of the base
  worlds, plus the users and groups of Debian's `base-passwd` (root, daemon, bin, sys, sudo,
  users, nobody and so on) even when no world defines them yet. The list is to be verified
  against Debian 13 in M6.
- The derivation does not avoid reserved names ("Root" → `root`); the check reports them and
  the player edits the name.

## Alternatives considered

- **First word only ("Jörg Müller" → `joerg`):** shorter and closer to many real accounts, but
  two players with the same first name in a family or a class get the same account, and the
  whole name is what the player typed.
- **Apostrophes as hyphens (`o-brien`):** reads worse and is not how such names are usually
  written in account names.
- **Texts instead of codes from the check:** the gameplay package would hold translatable text,
  which only the catalogs may (ADR 0007).
- **Only the names of the current worlds as reserved:** a later world with a standard Debian
  account such as `sudo` or `www-data` would collide with an existing save.
- **Appending a number to a reserved name (`root2`):** hides from the player why their name was
  changed; an explained error is clearer.

## Consequences

- The new game screen (M3.2b) calls `deriveUserName` while the player types, `checkUserName`
  with `reservedUserNames` of the loaded worlds before it creates the slot, and needs a catalog
  text for each problem code.
- A later world that adds an account with a name a player already uses (other than the Debian
  accounts) still collides with that save: `levelWorldSpec` refuses it. The save system (M3.7)
  or the story workshop (M4) has to handle that case, for example by checking new world
  accounts against the reserved names of existing saves or by renaming the account.
