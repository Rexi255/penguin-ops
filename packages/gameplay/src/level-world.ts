// The world of a level (ADR 0076, ADR 0077): the level's base world, the player's account on
// every host and the level's start files on its start host, as a `WorldSpec` that the engine
// builds. `~/` in world and start files is the player's home, and prose start files take their
// content from the catalogs in the player's language.

import {
  type BaseWorld,
  type BaseWorldHost,
  type FileEntry,
  type Level,
  PLAYER_ID,
} from "@penguin-ops/content";
import type { HostSpec, NodeSpec, WorldSpec } from "@penguin-ops/engine";

/**
 * The mode of the player's home directory: Debian's `adduser` creates homes with `DIR_MODE`
 * 0700 since Debian 12 (to be verified on Debian 13 in M6).
 */
export const PLAYER_HOME_MODE = 0o700;

/** The Linux user name rules of ADR 0019: a lowercase letter, then letters, digits, hyphens. */
const PLAYER_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;

/** Thrown when a level cannot start: an invalid player name, an unknown host or start file. */
export class LevelSetupError extends Error {
  override name = "LevelSetupError";
}

/**
 * Whether `name` is a valid Linux user name for the player (ADR 0019): a lowercase letter
 * followed by up to 31 lowercase letters, digits and hyphens.
 */
export function isValidPlayerName(name: string): boolean {
  return PLAYER_NAME_PATTERN.test(name);
}

/** The player's home directory. */
export function playerHome(player: string): string {
  return `/home/${player}`;
}

/** The host of `world` that a level starts on: `start.host`, or the world's first host. */
export function startHost(world: BaseWorld, level: Level): BaseWorldHost {
  const name = level.start.host;
  const host =
    name === undefined ? world.hosts[0] : world.hosts.find((candidate) => candidate.name === name);
  if (host === undefined) {
    throw new LevelSetupError(`the world "${world.id}" has no host "${name ?? ""}"`);
  }
  return host;
}

/**
 * The world of a level for the player `player`, ready for the engine's `buildWorld`:
 *
 * - every host of the base world gets the player's account: a group and a user with the
 *   player's name, UID and GID 1000 (`PLAYER_ID`), home `/home/<player>` with mode 0700;
 * - the start host gets the level's start files after the world's files; a start file replaces
 *   a world file with the same path;
 * - `~/` becomes the player's home; a prose file (`{ text: <key> }`) gets `fileTexts.get(key)`.
 *
 * Throws a LevelSetupError if the player's name is not valid (ADR 0019) or is already a user or
 * group of a host, if the start host does not exist, or if a prose file has no text.
 */
export function levelWorldSpec(
  world: BaseWorld,
  level: Level,
  player: string,
  fileTexts: ReadonlyMap<string, string>,
): WorldSpec {
  if (!isValidPlayerName(player)) {
    throw new LevelSetupError(
      `"${player}" is not a valid user name: a lowercase letter, then up to 31 lowercase ` +
        "letters, digits and hyphens",
    );
  }
  const start = startHost(world, level);
  return {
    hosts: world.hosts.map((host) => {
      if (
        host.users.some((user) => user.name === player) ||
        host.groups.some((group) => group.name === player)
      ) {
        throw new LevelSetupError(
          `the user name "${player}" is already taken on the host "${host.name}"`,
        );
      }
      const files: Record<string, NodeSpec> = {
        [`${playerHome(player)}/`]: { mode: PLAYER_HOME_MODE },
      };
      const entries = host === start ? [...host.files, ...level.start.files] : host.files;
      for (const entry of entries) {
        const [path, spec] = nodeSpec(entry, player, fileTexts);
        files[path] = spec;
      }
      const spec: HostSpec = {
        name: host.name,
        groups: [...host.groups, { name: player, gid: PLAYER_ID }],
        users: [
          ...host.users,
          { name: player, uid: PLAYER_ID, group: player, home: playerHome(player) },
        ],
        files,
      };
      return spec;
    }),
  };
}

/** The key and node spec of a file entry: directories end with "/", `~/` is the home. */
function nodeSpec(
  entry: FileEntry,
  player: string,
  fileTexts: ReadonlyMap<string, string>,
): [string, NodeSpec] {
  const path = entry.path.startsWith("~/")
    ? `${playerHome(player)}${entry.path.slice(1)}`
    : entry.path;
  const attributes = {
    ...(entry.owner === undefined ? {} : { owner: entry.owner }),
    ...(entry.group === undefined ? {} : { group: entry.group }),
    ...(entry.mode === undefined ? {} : { mode: entry.mode }),
  };
  switch (entry.kind) {
    case "directory":
      return [`${path}/`, attributes];
    case "file":
      return [path, { ...attributes, content: fileContent(entry.source, fileTexts) }];
  }
}

function fileContent(
  source: Extract<FileEntry, { kind: "file" }>["source"],
  fileTexts: ReadonlyMap<string, string>,
): string {
  switch (source.kind) {
    case "content":
      return source.content;
    case "text": {
      const text = fileTexts.get(source.key);
      if (text === undefined) {
        throw new LevelSetupError(`there is no text "${source.key}" for a start file`);
      }
      return text;
    }
  }
}
