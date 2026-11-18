// A login session (ADR 0009, ADR 0041, ADR 0042, ADR 0048): the shell of one user on one host. Like a
// Linux process, a session keeps the user and group IDs it got at login. A group change made
// later (for example with `usermod -aG`) reaches only sessions started after it, as in real
// Linux.

import type { Credentials } from "./credentials";
import { applyHistorySize, EMPTY_HISTORY, type History } from "./history";
import { lookup } from "./lookup";
import { hasPermission } from "./permissions";
import {
  findGroupByGid,
  findHost,
  findUser,
  findUserByUid,
  groupIdsOf,
  type Host,
  type User,
  type World,
} from "./world";

/** The state of one shell. */
export interface Session {
  /** The name of the host the session runs on. */
  readonly host: string;
  readonly credentials: Credentials;
  /**
   * The current working directory as an absolute path, as bash remembers it (ADR 0053): without
   * `.` and `..`, but possibly with a leading `//`, and possibly removed since.
   */
  readonly cwd: string;
  /**
   * The shell variables by name (ADR 0046). A variable that is missing is unset; a variable with
   * the empty string is set but empty. Export attributes follow with `export` and `env`.
   */
  readonly variables: ReadonlyMap<string, string>;
  /** The exit status of the last command, which `$?` expands to. A new shell starts with 0. */
  readonly exitStatus: number;
  /**
   * The file mode creation mask (ADR 0048): permission bits from 0 to 0o777 that new files and
   * directories do not get. A new file gets the mode `0o666 & ~umask`.
   */
  readonly umask: number;
  /** The history list of the shell (ADR 0057), which `history` shows. */
  readonly history: History;
}

/** Debian 13's `PATH` from `/etc/profile` for root and for all other users. */
const ROOT_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const USER_PATH = "/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games";

/**
 * The terminal type of the game's terminal (ADR 0056): an xterm-compatible terminal emulator,
 * as most of them (and SSH clients) report it on Debian 13.
 */
export const TERMINAL_TYPE = "xterm-256color";

/** Bash's default `IFS`: space, tab and line break. */
export const DEFAULT_IFS = " \t\n";

/**
 * The history variables of Debian 13's `/etc/skel/.bashrc`, which every user but root gets. Root's
 * `.bashrc` from `base-files` sets none, so bash's default `HISTSIZE` applies.
 */
const USER_HISTORY_CONTROL = "ignoreboth";
const USER_HISTORY_SIZE = "1000";

/** The `HISTSIZE` bash sets when no startup file did, `HISTSIZE_DEFAULT`. */
const DEFAULT_HISTORY_SIZE = "500";

/** The `UMASK` of Debian 13's `/etc/login.defs`. */
const LOGIN_UMASK = 0o022;

/** The umask of a user with a private group: the group bits copied from the owner bits. */
const PRIVATE_GROUP_UMASK = 0o002;

/**
 * Returns the umask a login gives `user`, like Debian 13's `pam_umask` with the `usergroups`
 * option: a user other than root whose primary group has the user's name gets 0o002, so the
 * members of a shared group can write the files; everybody else gets 0o022.
 */
function loginUmask(host: Host, user: User): number {
  const primaryGroup = findGroupByGid(host, user.gid);
  const hasPrivateGroup = user.uid !== 0 && primaryGroup?.name === user.name;
  return hasPrivateGroup ? PRIVATE_GROUP_UMASK : LOGIN_UMASK;
}

/**
 * Starts a session for the user `userName` on the host `hostName`. Like `login`, it starts in
 * the user's home directory if the user can change into it, and in `/` otherwise (the home is
 * missing, not a directory, or not searchable for the user). Throws an Error if the host or the
 * user does not exist.
 *
 * The shell variables are those that `login`, `/etc/profile` and bash set on Debian 13: `HOME`
 * (the home from the user list, as written there), `USER`, `LOGNAME`, `SHELL`, `PATH`, `PWD`,
 * `HOSTNAME` and `IFS`, and `TERM` from the terminal (`TERMINAL_TYPE`). `OLDPWD` is unset until
 * the first `cd`. The umask comes from `loginUmask`.
 *
 * The history (ADR 0057) starts empty, because the history file is not simulated. Users other
 * than root get `HISTCONTROL=ignoreboth` and `HISTSIZE=1000` from Debian's `/etc/skel/.bashrc`;
 * root gets bash's default `HISTSIZE=500` and no `HISTCONTROL`.
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
    ["HISTSIZE", user.uid === 0 ? DEFAULT_HISTORY_SIZE : USER_HISTORY_SIZE],
    ["HOSTNAME", host.name],
    ["IFS", DEFAULT_IFS],
    ["LOGNAME", user.name],
    ["PATH", user.uid === 0 ? ROOT_PATH : USER_PATH],
    ["PWD", cwd],
    ["SHELL", user.shell],
    ["TERM", TERMINAL_TYPE],
    ["USER", user.name],
  ]);
  if (user.uid !== 0) {
    variables.set("HISTCONTROL", USER_HISTORY_CONTROL);
  }
  return {
    host: host.name,
    credentials,
    cwd,
    variables,
    exitStatus: 0,
    umask: loginUmask(host, user),
    history: applyHistorySize(EMPTY_HISTORY, variables.get("HISTSIZE")),
  };
}

/**
 * Sets the shell variable `name` to `value`, or unsets it if `value` is `undefined`. Like bash's
 * special variables, a new `HISTSIZE` applies to the history at once (`applyHistorySize`).
 */
export function setVariable(session: Session, name: string, value: string | undefined): Session {
  const variables = new Map(session.variables);
  if (value === undefined) {
    variables.delete(name);
  } else {
    variables.set(name, value);
  }
  const history = name === "HISTSIZE" ? applyHistorySize(session.history, value) : session.history;
  return { ...session, variables, history };
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
