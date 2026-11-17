// World builder (ADR 0008, ADR 0043). Writing a world as nested FileNode and DirectoryNode
// objects is long and easy to get wrong. The builder takes a short description instead: users
// and groups by name, and files as a map from absolute paths to contents. It fills in the
// defaults, creates missing parent directories and checks the result with `createWorld`.

import type { Clock } from "./clock";
import type { DirectoryNode, FileNode, FsNode } from "./fs-node";
import { type Gid, MAX_ID, toGid, toUid, type Uid } from "./ids";
import { splitPath } from "./path";
import {
  createWorld,
  type Group,
  type Host,
  InvalidWorldError,
  type User,
  type World,
} from "./world";

/** A group, like a line of `/etc/group`. */
export interface GroupSpec {
  readonly name: string;
  readonly gid: number;
  /** Names of the users that have this group as a supplementary group. Default: none. */
  readonly members?: readonly string[];
}

/** An account, like a line of `/etc/passwd`. */
export interface UserSpec {
  readonly name: string;
  readonly uid: number;
  /** Name of the primary group. Default: the group with the user's name, as on Debian. */
  readonly group?: string;
  /** Default: `/root` for UID 0, `/home/<name>` otherwise. */
  readonly home?: string;
  /** Default: `/bin/bash`. */
  readonly shell?: string;
}

/**
 * A file or directory. A path that ends with "/" names a directory, any other path a file. A
 * plain string is the content of a file with default attributes.
 */
export type NodeSpec =
  | string
  | {
      /** Content of a file. Default: empty. Not allowed for directories. */
      readonly content?: string;
      /** Name of the owning user. Default: see `buildWorld`. */
      readonly owner?: string;
      /** Name of the owning group. Default: the owner's primary group. */
      readonly group?: string;
      /** Permission bits. Default: 0o644 for files and 0o755 for directories. */
      readonly mode?: number;
      /** Time of the last change in milliseconds since the epoch. Default: the clock's time. */
      readonly mtime?: number;
    };

/** One computer of the world. */
export interface HostSpec {
  readonly name: string;
  /** Groups in `/etc/group` order. */
  readonly groups: readonly GroupSpec[];
  /** Users in `/etc/passwd` order. */
  readonly users: readonly UserSpec[];
  /** Files and directories by absolute path. Default: only the root directory. */
  readonly files?: Readonly<Record<string, NodeSpec>>;
}

/** A short description of a world. */
export interface WorldSpec {
  readonly hosts: readonly HostSpec[];
}

/** Debian's UID_MIN: users from this UID on are regular users, below are system users. */
const FIRST_REGULAR_UID = 1000;

const DEFAULT_SHELL = "/bin/bash";
const DEFAULT_FILE_MODE = 0o644;
const DEFAULT_DIRECTORY_MODE = 0o755;

/**
 * Builds a world from `spec` and checks it with `createWorld`. Throws an InvalidWorldError for
 * the first problem found.
 *
 * Files and directories:
 *
 * - paths are absolute and contain no "." or ".." and no invalid names; "/" sets the
 *   attributes of the root directory;
 * - a path that ends with "/" is a directory, any other path a file; each node is listed at
 *   most once, and a file cannot be the parent of another path;
 * - missing parent directories are created with default attributes;
 * - the default owner of a node inside the home directory of a regular user (UID 1000 or more),
 *   or of that home directory itself, is that user; every other node belongs to root (UID 0);
 * - the default group is the primary group of the owner; for root it is GID 0;
 * - the default mtime is `clock.now()`, so a world built at game start has the start time.
 *
 * Entries of a directory keep the order of `files`; commands sort them as they need.
 */
export function buildWorld(spec: WorldSpec, clock: Clock): World {
  return createWorld({ hosts: spec.hosts.map((host) => buildHost(host, clock.now())) });
}

type Fail = (problem: string) => never;

/** Whether `value` is a valid user or group ID (the range `toUid` and `toGid` accept). */
function isValidId(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_ID;
}

function buildHost(spec: HostSpec, now: number): Host {
  const fail: Fail = (problem) => {
    throw new InvalidWorldError(`host "${spec.name}": ${problem}`);
  };
  const groups = spec.groups.map((group) => buildGroup(group, fail));
  const users = spec.users.map((user) => buildUser(user, groups, fail));
  const root = buildTree(spec.files ?? {}, users, groups, now, fail);
  return { name: spec.name, root, users, groups };
}

function buildGroup(spec: GroupSpec, fail: Fail): Group {
  if (!isValidId(spec.gid)) {
    return fail(`group "${spec.name}" has the invalid gid ${String(spec.gid)}`);
  }
  return { name: spec.name, gid: toGid(spec.gid), members: [...(spec.members ?? [])] };
}

function buildUser(spec: UserSpec, groups: readonly Group[], fail: Fail): User {
  if (!isValidId(spec.uid)) {
    return fail(`user "${spec.name}" has the invalid uid ${String(spec.uid)}`);
  }
  const uid = toUid(spec.uid);
  const groupName = spec.group ?? spec.name;
  const group = groups.find((candidate) => candidate.name === groupName);
  if (group === undefined) {
    return fail(`user "${spec.name}" has the primary group "${groupName}", which does not exist`);
  }
  return {
    name: spec.name,
    uid,
    gid: group.gid,
    home: spec.home ?? (spec.uid === 0 ? "/root" : `/home/${spec.name}`),
    shell: spec.shell ?? DEFAULT_SHELL,
  };
}

/** A node spec after its path was checked: the path components and what the path names. */
interface PlacedSpec {
  readonly path: string;
  readonly components: readonly string[];
  readonly kind: "file" | "directory";
  readonly spec: NodeSpec;
}

/** A file while the tree is built. */
interface DraftFile {
  readonly kind: "file";
  readonly spec: PlacedSpec;
}

/**
 * A directory while the tree is built: entries are added as the specs are placed. A directory
 * that was only created as a parent has no spec of its own.
 */
interface DraftDirectory {
  readonly kind: "directory";
  spec: PlacedSpec | undefined;
  readonly components: readonly string[];
  readonly entries: Map<string, DraftNode>;
}

type DraftNode = DraftFile | DraftDirectory;

function buildTree(
  files: Readonly<Record<string, NodeSpec>>,
  users: readonly User[],
  groups: readonly Group[],
  now: number,
  fail: Fail,
): DirectoryNode {
  const root: DraftDirectory = {
    kind: "directory",
    spec: undefined,
    components: [],
    entries: new Map(),
  };
  for (const [path, spec] of Object.entries(files)) {
    place(root, placeSpec(path, spec, fail), fail);
  }
  const attributes = (draft: DraftNode): Attributes =>
    resolveAttributes(draft, users, groups, now, fail);
  return finishDirectory(root, attributes);
}

function placeSpec(path: string, spec: NodeSpec, fail: Fail): PlacedSpec {
  const parts = splitPath(path);
  if (!parts.absolute) {
    return fail(`the path "${path}" is not absolute`);
  }
  // Other invalid names (for example with a NUL character) are reported by createWorld.
  for (const component of parts.components) {
    if (component === "." || component === "..") {
      return fail(`the path "${path}" contains "${component}"`);
    }
  }
  const kind = parts.trailingSlash ? "directory" : "file";
  if (kind === "directory" && (typeof spec === "string" || spec.content !== undefined)) {
    return fail(`the directory "${path}" cannot have content`);
  }
  return { path, components: parts.components, kind, spec };
}

/** Adds `placed` to the tree below `root`, creating missing parent directories on the way. */
function place(root: DraftDirectory, placed: PlacedSpec, fail: Fail): void {
  let directory: DraftDirectory = root;
  for (const [index, name] of placed.components.entries()) {
    const isLast = index === placed.components.length - 1;
    const existing = directory.entries.get(name);
    if (isLast && placed.kind === "file") {
      switch (existing?.kind) {
        case undefined:
          directory.entries.set(name, { kind: "file", spec: placed });
          return;
        case "file":
          return fail(`the path "${placed.path}" is listed more than once`);
        case "directory":
          return fail(
            `the path "${placed.path}" is listed as a file, but other paths need it to be a directory`,
          );
      }
    }
    if (existing?.kind === "file") {
      return fail(
        `the path "${placed.path}" needs "${existing.spec.path}" to be a directory, but it is a file`,
      );
    }
    const child: DraftDirectory = existing ?? {
      kind: "directory",
      spec: undefined,
      components: placed.components.slice(0, index + 1),
      entries: new Map(),
    };
    directory.entries.set(name, child);
    directory = child;
  }
  // The path names a directory (possibly "/"): attach the spec to it.
  if (directory.spec !== undefined) {
    return fail(`the path "${placed.path}" is listed more than once`);
  }
  directory.spec = placed;
}

interface Attributes {
  readonly owner: Uid;
  readonly group: Gid;
  readonly mode: number;
  readonly mtime: number;
}

function finishDirectory(
  draft: DraftDirectory,
  attributes: (draft: DraftNode) => Attributes,
): DirectoryNode {
  const entries = new Map<string, FsNode>();
  for (const [name, child] of draft.entries) {
    entries.set(name, finishNode(child, attributes));
  }
  return { kind: "directory", ...attributes(draft), entries };
}

function finishNode(draft: DraftNode, attributes: (draft: DraftNode) => Attributes): FsNode {
  switch (draft.kind) {
    case "file": {
      const node: FileNode = {
        kind: "file",
        ...attributes(draft),
        content:
          typeof draft.spec.spec === "string" ? draft.spec.spec : (draft.spec.spec.content ?? ""),
      };
      return node;
    }
    case "directory":
      return finishDirectory(draft, attributes);
  }
}

function resolveAttributes(
  draft: DraftNode,
  users: readonly User[],
  groups: readonly Group[],
  now: number,
  fail: Fail,
): Attributes {
  const placed = draft.spec;
  const components = draft.kind === "file" ? draft.spec.components : draft.components;
  const options = placed === undefined || typeof placed.spec === "string" ? {} : placed.spec;
  const path = placed?.path ?? `/${components.join("/")}`;

  let owner: User | undefined;
  if (options.owner !== undefined) {
    const name = options.owner;
    owner = users.find((user) => user.name === name);
    if (owner === undefined) {
      return fail(`"${path}" has the owner "${name}", which does not exist`);
    }
  } else {
    owner = homeOwner(components, users);
  }

  let group: Gid = owner?.gid ?? toGid(0);
  if (options.group !== undefined) {
    const name = options.group;
    const found = groups.find((candidate) => candidate.name === name);
    if (found === undefined) {
      return fail(`"${path}" has the group "${name}", which does not exist`);
    }
    group = found.gid;
  }

  return {
    owner: owner?.uid ?? toUid(0),
    group,
    mode: options.mode ?? (draft.kind === "file" ? DEFAULT_FILE_MODE : DEFAULT_DIRECTORY_MODE),
    mtime: options.mtime ?? now,
  };
}

/**
 * Returns the regular user whose home directory is the node at `components` or contains it. If
 * homes are nested, the innermost home wins. Returns undefined for nodes outside every home.
 */
function homeOwner(components: readonly string[], users: readonly User[]): User | undefined {
  let best: User | undefined;
  let bestDepth = -1;
  for (const user of users) {
    if (user.uid < FIRST_REGULAR_UID) {
      continue;
    }
    const home = splitPath(user.home).components;
    const inside =
      home.length <= components.length && home.every((name, i) => components[i] === name);
    if (inside && home.length > bestDepth) {
      best = user;
      bestDepth = home.length;
    }
  }
  return best;
}
