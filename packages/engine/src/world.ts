// The simulated world (ADR 0009, ADR 0041): a set of hosts, each with its own file system, users
// and groups. The MVP has one host, but every API already names the host it works on. All data
// is immutable; a change produces a new world.

import { type DirectoryNode, type FsNode, isValidEntryName, isValidMode } from "./fs-node";
import type { Gid, Uid } from "./ids";

/** An account, like a line of `/etc/passwd`. */
export interface User {
  readonly name: string;
  readonly uid: Uid;
  /** The primary group. */
  readonly gid: Gid;
  /** Absolute path of the home directory. It does not have to exist. */
  readonly home: string;
  /** Absolute path of the login shell. */
  readonly shell: string;
}

/** A group, like a line of `/etc/group`. */
export interface Group {
  readonly name: string;
  readonly gid: Gid;
  /** Names of the users that have this group as a supplementary group. */
  readonly members: readonly string[];
}

/** One computer of the world. Services, processes and network settings follow later. */
export interface Host {
  /** The host name shown in the prompt, for example `ws01`. */
  readonly name: string;
  /** The root directory `/` of the host's file system. */
  readonly root: DirectoryNode;
  /** All users, in the order of `/etc/passwd`. */
  readonly users: readonly User[];
  /** All groups, in the order of `/etc/group`. */
  readonly groups: readonly Group[];
}

/** The whole simulated world. */
export interface World {
  /** All hosts. Host names are unique. */
  readonly hosts: readonly Host[];
}

/** Thrown by `createWorld` when the world data breaks a rule of the world model. */
export class InvalidWorldError extends Error {
  override name = "InvalidWorldError";
}

/**
 * Checks the world data and returns it as a new world. Throws an InvalidWorldError for the
 * first problem found:
 *
 * - the world needs at least one host, and host names are single lowercase DNS labels
 *   (letters, digits and inner hyphens, at most 63 characters) that are unique;
 * - user names and group names are non-empty and contain no ":", "/" or whitespace;
 * - user names, UIDs, group names and GIDs are unique per host;
 * - every user's primary group exists, home and shell are absolute paths;
 * - every group member is an existing user and appears only once;
 * - every directory entry has a valid name, and every node a valid mode and mtime.
 *
 * Owners and groups of file system nodes may be IDs without a user or group, as in Linux.
 */
export function createWorld(world: World): World {
  if (world.hosts.length === 0) {
    throw new InvalidWorldError("a world needs at least one host");
  }
  const hostNames = new Set<string>();
  for (const host of world.hosts) {
    if (hostNames.has(host.name)) {
      throw new InvalidWorldError(`duplicate host name "${host.name}"`);
    }
    hostNames.add(host.name);
    checkHost(host);
  }
  return { hosts: [...world.hosts] };
}

const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const ACCOUNT_NAME = /^[^\s:/]+$/u;

function checkHost(host: Host): void {
  if (!HOST_NAME.test(host.name)) {
    throw new InvalidWorldError(`invalid host name "${host.name}"`);
  }
  const fail = (problem: string): never => {
    throw new InvalidWorldError(`host "${host.name}": ${problem}`);
  };
  checkGroups(host, fail);
  checkUsers(host, fail);
  checkNode(host.root, "/", fail);
}

type Fail = (problem: string) => never;

function checkUsers(host: Host, fail: Fail): void {
  const names = new Set<string>();
  const uids = new Map<number, string>();
  for (const user of host.users) {
    if (!ACCOUNT_NAME.test(user.name)) {
      fail(`invalid user name "${user.name}"`);
    }
    if (names.has(user.name)) {
      fail(`duplicate user name "${user.name}"`);
    }
    names.add(user.name);
    const other = uids.get(user.uid);
    if (other !== undefined) {
      fail(`duplicate uid ${String(user.uid)} (users "${other}" and "${user.name}")`);
    }
    uids.set(user.uid, user.name);
    if (findGroupByGid(host, user.gid) === undefined) {
      fail(`user "${user.name}" has primary gid ${String(user.gid)}, but no group has it`);
    }
    if (!user.home.startsWith("/")) {
      fail(`user "${user.name}" has a home that is not an absolute path: "${user.home}"`);
    }
    if (!user.shell.startsWith("/")) {
      fail(`user "${user.name}" has a shell that is not an absolute path: "${user.shell}"`);
    }
  }
}

function checkGroups(host: Host, fail: Fail): void {
  const names = new Set<string>();
  const gids = new Map<number, string>();
  for (const group of host.groups) {
    if (!ACCOUNT_NAME.test(group.name)) {
      fail(`invalid group name "${group.name}"`);
    }
    if (names.has(group.name)) {
      fail(`duplicate group name "${group.name}"`);
    }
    names.add(group.name);
    const other = gids.get(group.gid);
    if (other !== undefined) {
      fail(`duplicate gid ${String(group.gid)} (groups "${other}" and "${group.name}")`);
    }
    gids.set(group.gid, group.name);
    const members = new Set<string>();
    for (const member of group.members) {
      if (findUser(host, member) === undefined) {
        fail(`group "${group.name}" lists the unknown member "${member}"`);
      }
      if (members.has(member)) {
        fail(`group "${group.name}" lists the member "${member}" twice`);
      }
      members.add(member);
    }
  }
}

function checkNode(node: FsNode, path: string, fail: Fail): void {
  if (!isValidMode(node.mode)) {
    fail(`${path} has an invalid mode ${String(node.mode)}`);
  }
  if (!Number.isSafeInteger(node.mtime)) {
    fail(`${path} has an invalid mtime ${String(node.mtime)}`);
  }
  switch (node.kind) {
    case "file":
      return;
    case "directory":
      for (const [name, child] of node.entries) {
        if (!isValidEntryName(name)) {
          fail(`${path} has an entry with the invalid name ${JSON.stringify(name)}`);
        }
        checkNode(child, path === "/" ? `/${name}` : `${path}/${name}`, fail);
      }
  }
}

/** Returns the host called `name`, or undefined if the world has no such host. */
export function findHost(world: World, name: string): Host | undefined {
  return world.hosts.find((host) => host.name === name);
}

/**
 * Returns a new world in which the host called `hostName` has the root directory `root`; all
 * other hosts and the host's users and groups stay the same objects. Throws an Error if the world
 * has no such host.
 */
export function replaceHostRoot(world: World, hostName: string, root: DirectoryNode): World {
  if (findHost(world, hostName) === undefined) {
    throw new Error(`no host "${hostName}" in the world`);
  }
  return {
    hosts: world.hosts.map((host) => (host.name === hostName ? { ...host, root } : host)),
  };
}

/** Returns the user called `name`, or undefined. */
export function findUser(host: Host, name: string): User | undefined {
  return host.users.find((user) => user.name === name);
}

/** Returns the user with the ID `uid`, or undefined. */
export function findUserByUid(host: Host, uid: Uid): User | undefined {
  return host.users.find((user) => user.uid === uid);
}

/** Returns the group called `name`, or undefined. */
export function findGroup(host: Host, name: string): Group | undefined {
  return host.groups.find((group) => group.name === name);
}

/** Returns the group with the ID `gid`, or undefined. */
export function findGroupByGid(host: Host, gid: Gid): Group | undefined {
  return host.groups.find((group) => group.gid === gid);
}

/**
 * Returns the IDs of all groups of `user`, like `id -G`: the primary group first, then every
 * group that lists the user as a member, in the order of `/etc/group`, without repeats.
 */
export function groupIdsOf(host: Host, user: User): readonly Gid[] {
  const ids: Gid[] = [user.gid];
  for (const group of host.groups) {
    if (group.members.includes(user.name) && !ids.includes(group.gid)) {
      ids.push(group.gid);
    }
  }
  return ids;
}
