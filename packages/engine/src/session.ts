// A login session (ADR 0009, ADR 0041): the shell of one user on one host. Like a Linux process,
// a session keeps the user and group IDs it got at login. A group change made later (for
// example with `usermod -aG`) reaches only sessions started after it, as in real Linux.

import type { Gid, Uid } from "./ids";
import { type World, findHost, findUser, findUserByUid, groupIdsOf } from "./world";

/** The identity of a session, fixed at login like the credentials of a Linux process. */
export interface Credentials {
  readonly uid: Uid;
  /** The primary group. */
  readonly gid: Gid;
  /** All groups including the primary group, in the order of `groupIdsOf`. */
  readonly groups: readonly Gid[];
}

/** The state of one shell. Variables and history follow with the interpreter. */
export interface Session {
  /** The name of the host the session runs on. */
  readonly host: string;
  readonly credentials: Credentials;
  /** The current working directory as an absolute path. */
  readonly cwd: string;
}

/**
 * Starts a session for the user `userName` on the host `hostName`, in the user's home
 * directory. Throws an Error if the host or the user does not exist.
 */
export function createSession(world: World, hostName: string, userName: string): Session {
  const host = findHost(world, hostName);
  if (host === undefined) {
    throw new Error(`cannot start a session: no host "${hostName}"`);
  }
  const user = findUser(host, userName);
  if (user === undefined) {
    throw new Error(`cannot start a session: no user "${userName}" on host "${hostName}"`);
  }
  return {
    host: host.name,
    credentials: { uid: user.uid, gid: user.gid, groups: groupIdsOf(host, user) },
    cwd: user.home,
  };
}

/** What bash shows for `\u` when the session's user ID has no user, for example after `userdel`. */
const NO_NAME = "I have no name!";

/**
 * Returns the `user@host` part of the prompt (bash's `\u@\h`). Throws an Error if the session's
 * host is not part of `world`.
 */
export function userAtHost(world: World, session: Session): string {
  const host = findHost(world, session.host);
  if (host === undefined) {
    throw new Error(`the session's host "${session.host}" is not part of the world`);
  }
  const user = findUserByUid(host, session.credentials.uid);
  return `${user?.name ?? NO_NAME}@${host.name}`;
}
