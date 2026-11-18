// Schema of a base world, `content/worlds/<world-id>.yaml` (ADR 0076), described in
// docs/LEVEL-AUTHORING.md: the hosts of the simulated company with their groups, users and
// files. Levels start from a base world and add their own start files. The player's account
// is not part of the file: the level session adds it to every host with the name the player
// chose (ADR 0019), so the file keeps the player's user and group ID free.
//
// The schema checks each host on its own, like the engine's `createWorld` but with the place
// in the file: unique names and IDs, existing primary groups and members, and owners and groups
// of files that exist. Whether a level's world and start host exist is checked by the content
// loader; whether a level's world builds is checked by the content tests (ROADMAP M2.4b).

import { z } from "zod";

import { accountNameSchema, type FileEntry, literalFileEntriesSchema } from "./file-entries-schema";
import { idSchema, reportDuplicates } from "./level-schema";

/** The world format version that this schema reads. */
export const WORLD_FORMAT_VERSION = 1;

/** The base world of a level that does not name one: the standard office world. */
export const DEFAULT_WORLD_ID = "office";

/**
 * The user and group ID of the player's account on every host (Debian's first regular UID),
 * which a base world must leave free.
 */
export const PLAYER_ID = 1000;

/** The highest user or group ID, as in the engine (`MAX_ID`). */
const MAX_ACCOUNT_ID = 2 ** 32 - 2;

/** A group, like a line of `/etc/group`. */
export interface BaseWorldGroup {
  readonly name: string;
  readonly gid: number;
  /** Users that have this group as a supplementary group. */
  readonly members: readonly string[];
}

/** An account, like a line of `/etc/passwd`; unset fields get the engine's defaults. */
export interface BaseWorldUser {
  readonly name: string;
  readonly uid: number;
  /** Name of the primary group. Default: the group with the user's name. */
  readonly group?: string;
  /** Default: `/root` for UID 0, `/home/<name>` otherwise. */
  readonly home?: string;
  /** Default: `/bin/bash`. */
  readonly shell?: string;
}

/** One computer of a base world. */
export interface BaseWorldHost {
  readonly name: string;
  /** Groups in `/etc/group` order. */
  readonly groups: readonly BaseWorldGroup[];
  /** Users in `/etc/passwd` order. */
  readonly users: readonly BaseWorldUser[];
  /** Files and directories, in the order of the file; `~/` is the player's home. */
  readonly files: readonly FileEntry[];
}

/** A checked base world. */
export interface BaseWorld {
  readonly format: typeof WORLD_FORMAT_VERSION;
  /** Stable kebab-case ID, the name of the file. */
  readonly id: string;
  /** The hosts; the first one is the default host, where a level starts. */
  readonly hosts: readonly BaseWorldHost[];
}

/** Host names as the engine allows them (ADR 0009). */
const HOST_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

const accountIdSchema = (what: string) =>
  z
    .int({ error: `a ${what} is a whole number` })
    .min(0, { error: `a ${what} is not negative` })
    .max(MAX_ACCOUNT_ID, { error: `a ${what} is at most ${String(MAX_ACCOUNT_ID)}` })
    .refine((id) => id !== PLAYER_ID, {
      error: `the ${what} ${String(PLAYER_ID)} belongs to the player's account`,
    });

const absolutePathSchema = (what: string) =>
  z.string().regex(/^\//u, { error: `${what} must be an absolute path` });

const groupSchema = z
  .strictObject({
    name: accountNameSchema.meta({ description: "Group name." }),
    gid: accountIdSchema("gid").meta({ description: "Group ID." }),
    members: z
      .array(accountNameSchema)
      .default([])
      .superRefine((members, context) => {
        reportDuplicates(members, "the member", context);
      })
      .meta({ description: "Users that have this group as a supplementary group." }),
  })
  .transform((group): BaseWorldGroup => group);

const userSchema = z
  .strictObject({
    name: accountNameSchema.meta({ description: "User name." }),
    uid: accountIdSchema("uid").meta({ description: "User ID." }),
    group: accountNameSchema
      .meta({ description: "Primary group. Default: the group with the user's name." })
      .optional(),
    home: absolutePathSchema("a home directory")
      .meta({ description: "Home directory. Default: /root for uid 0, /home/<name> otherwise." })
      .optional(),
    shell: absolutePathSchema("a login shell")
      .meta({ description: "Login shell. Default: /bin/bash." })
      .optional(),
  })
  .transform((user): BaseWorldUser => ({
    name: user.name,
    uid: user.uid,
    ...(user.group === undefined ? {} : { group: user.group }),
    ...(user.home === undefined ? {} : { home: user.home }),
    ...(user.shell === undefined ? {} : { shell: user.shell }),
  }));

const hostObjectSchema = z.strictObject({
  name: z
    .string()
    .regex(HOST_NAME_PATTERN, { error: "not a valid host name" })
    .meta({ description: "Host name." }),
  groups: z.array(groupSchema).meta({ description: "Groups in /etc/group order." }),
  users: z.array(userSchema).meta({ description: "Users in /etc/passwd order." }),
  files: literalFileEntriesSchema("file")
    .prefault({})
    .meta({ description: "Files and directories, by path; ~/ is the player's home." }),
});

// The checks across the fields of a host run in a pipe, so only on a host whose fields are all
// valid: zod runs the refinements of an object also when one of its fields has problems.
const hostSchema = hostObjectSchema.pipe(
  z.custom<z.output<typeof hostObjectSchema>>().superRefine((host, context) => {
    checkHost(host, (path, message) => {
      context.addIssue({ code: "custom", path, message });
    });
  }),
);

/** Schema of a `content/worlds/<world-id>.yaml` file. */
export const baseWorldSchema = z
  .strictObject({
    format: z
      .literal(WORLD_FORMAT_VERSION, {
        error: `the world format version must be ${String(WORLD_FORMAT_VERSION)}`,
      })
      .meta({ description: "World format version." }),
    id: idSchema("a world ID").meta({
      description: "Stable world ID; must match the file name and never change.",
    }),
    hosts: z
      .array(hostSchema)
      .min(1, { error: "a world needs at least one host" })
      .superRefine((hosts, context) => {
        reportDuplicates(
          hosts.map((host) => host.name),
          "the host name",
          context,
          (index) => [index, "name"],
        );
      })
      .meta({ description: "The hosts; the first one is the default host." }),
  })
  .transform((world): BaseWorld => world)
  .meta({
    title: "PenguinOps world",
    description: "A base world of PenguinOps: content/worlds/<world-id>.yaml.",
  });

/** The form of a world file as the YAML parser reads it. */
export type BaseWorldInput = z.input<typeof baseWorldSchema>;

type Report = (path: PropertyKey[], message: string) => void;

/**
 * Checks a host against itself: every host has root (UID 0) and its group root (GID 0); names
 * and IDs of users and groups are unique; primary groups and members exist; owners and groups
 * of files exist.
 */
function checkHost(host: BaseWorldHost, report: Report): void {
  reportRepeated(
    host.groups.map((group) => group.name),
    (index, name) => {
      report(["groups", index, "name"], `the group name "${name}" is repeated`);
    },
  );
  reportRepeated(
    host.groups.map((group) => String(group.gid)),
    (index, gid) => {
      report(["groups", index, "gid"], `the gid ${gid} is repeated`);
    },
  );
  reportRepeated(
    host.users.map((user) => user.name),
    (index, name) => {
      report(["users", index, "name"], `the user name "${name}" is repeated`);
    },
  );
  reportRepeated(
    host.users.map((user) => String(user.uid)),
    (index, uid) => {
      report(["users", index, "uid"], `the uid ${uid} is repeated`);
    },
  );

  const groupNames = new Set(host.groups.map((group) => group.name));
  const userNames = new Set(host.users.map((user) => user.name));
  if (!host.users.some((user) => user.name === "root" && user.uid === 0)) {
    report(["users"], 'a host needs the user "root" with uid 0');
  }
  if (!host.groups.some((group) => group.name === "root" && group.gid === 0)) {
    report(["groups"], 'a host needs the group "root" with gid 0');
  }
  host.users.forEach((user, index) => {
    const group = user.group ?? user.name;
    if (!groupNames.has(group)) {
      report(
        ["users", index, ...(user.group === undefined ? ["name"] : ["group"])],
        `the primary group "${group}" of the user "${user.name}" does not exist on the host`,
      );
    }
  });
  host.groups.forEach((group, groupIndex) => {
    group.members.forEach((member, memberIndex) => {
      if (!userNames.has(member)) {
        report(
          ["groups", groupIndex, "members", memberIndex],
          `the member "${member}" is no user of the host`,
        );
      }
    });
  });
  for (const entry of host.files) {
    if (entry.owner !== undefined && !userNames.has(entry.owner)) {
      report(["files", entryKey(entry)], `the owner "${entry.owner}" is no user of the host`);
    }
    if (entry.group !== undefined && !groupNames.has(entry.group)) {
      report(["files", entryKey(entry)], `the group "${entry.group}" is no group of the host`);
    }
  }
}

/** The key of a file entry in the YAML map: directories end with "/". */
function entryKey(entry: FileEntry): string {
  return entry.kind === "directory" ? `${entry.path}/` : entry.path;
}

/** Calls `report` for every value that an earlier one repeats. */
function reportRepeated(
  values: readonly string[],
  report: (index: number, value: string) => void,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      report(index, value);
    }
    seen.add(value);
  });
}
