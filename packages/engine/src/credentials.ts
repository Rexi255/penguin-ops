// The identity a session acts with (ADR 0041). Like the credentials of a Linux process, it is
// fixed at login; permission checks (ADR 0042) use it instead of looking the user up again.

import type { Gid, Uid } from "./ids";

/** The identity of a session, fixed at login like the credentials of a Linux process. */
export interface Credentials {
  readonly uid: Uid;
  /** The primary group. */
  readonly gid: Gid;
  /** All groups including the primary group, in the order of `groupIdsOf`. */
  readonly groups: readonly Gid[];
}
