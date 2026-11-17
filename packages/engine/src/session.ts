// A login session (ADR 0009, ADR 0041, ADR 0042): the shell of one user on one host. Like a
// Linux process, a session keeps the user and group IDs it got at login. A group change made
// later (for example with `usermod -aG`) reaches only sessions started after it, as in real
// Linux.

import type { Credentials } from "./credentials";
import { lookup } from "./lookup";
import { hasPermission } from "./permissions";
import { type World, findHost, findUser, findUserByUid, groupIdsOf } from "./world";

/** The state of one shell. Variables and history follow with the interpreter. */
export interface Session {
  /** The name of the host the session runs on. */
  readonly host: string;
  readonly credentials: Credentials;
  /** The current working directory as an absolute path. */
  readonly cwd: string;
}

/**
 * Starts a session for the user `userName` on the host `hostName`. Like `login`, it starts in
 * the user's home directory if the user can change into it, and in `/` otherwise (the home is
 * missing, not a directory, or not searchable for the user). Throws an Error if the host or the
 * user does not exist.
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
  const credentials: Credentials = {
    uid: user.uid,
    gid: user.gid,
    groups: groupIdsOf(host, user),
  };
  const home = lookup(host.root, credentials, "/", user.home);
  const canEnterHome =
    home.ok && home.node.kind === "directory" && hasPermission(home.node, credentials, "execute");
  return { host: host.name, credentials, cwd: canEnterHome ? home.path : "/" };
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
