// A login session (ADR 0009, ADR 0041, ADR 0042): the shell of one user on one host. Like a
// Linux process, a session keeps the user and group IDs it got at login. A group change made
// later (for example with `usermod -aG`) reaches only sessions started after it, as in real
// Linux.

import type { Credentials } from "./credentials";
import { lookup } from "./lookup";
import { hasPermission } from "./permissions";
import { type World, findHost, findUser, findUserByUid, groupIdsOf } from "./world";

/** The state of one shell. The history follows with ROADMAP M1.11. */
export interface Session {
  /** The name of the host the session runs on. */
  readonly host: string;
  readonly credentials: Credentials;
  /** The current working directory as an absolute path. */
  readonly cwd: string;
  /**
   * The shell variables by name (ADR 0046). A variable that is missing is unset; a variable with
   * the empty string is set but empty. Export attributes follow with `export` and `env`.
   */
  readonly variables: ReadonlyMap<string, string>;
  /** The exit status of the last command, which `$?` expands to. A new shell starts with 0. */
  readonly exitStatus: number;
}

/** Debian 13's `PATH` from `/etc/profile` for root and for all other users. */
const ROOT_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const USER_PATH = "/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games";

/** Bash's default `IFS`: space, tab and line break. */
export const DEFAULT_IFS = " \t\n";

/**
 * Starts a session for the user `userName` on the host `hostName`. Like `login`, it starts in
 * the user's home directory if the user can change into it, and in `/` otherwise (the home is
 * missing, not a directory, or not searchable for the user). Throws an Error if the host or the
 * user does not exist.
 *
 * The shell variables are those that `login`, `/etc/profile` and bash set on Debian 13: `HOME`
 * (the home from the user list, as written there), `USER`, `LOGNAME`, `SHELL`, `PATH`, `PWD`,
 * `HOSTNAME` and `IFS`. `OLDPWD` is unset until the first `cd`.
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
  const cwd = canEnterHome ? home.path : "/";
  const variables = new Map([
    ["HOME", user.home],
    ["HOSTNAME", host.name],
    ["IFS", DEFAULT_IFS],
    ["LOGNAME", user.name],
    ["PATH", user.uid === 0 ? ROOT_PATH : USER_PATH],
    ["PWD", cwd],
    ["SHELL", user.shell],
    ["USER", user.name],
  ]);
  return { host: host.name, credentials, cwd, variables, exitStatus: 0 };
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
