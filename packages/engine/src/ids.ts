// User and group IDs (ADR 0041). Linux stores owners and groups as numbers, not names: `ls -l`
// looks the names up and shows the bare number when no user or group has it any more. Both IDs
// are plain numbers at run time, but they are separate "branded" types at compile time, so the
// compiler rejects a group ID where a user ID is expected (for example in `chown`).

declare const uidBrand: unique symbol;
declare const gidBrand: unique symbol;

/** A user ID. Create one with `toUid`. */
export type Uid = number & { readonly [uidBrand]: true };

/** A group ID. Create one with `toGid`. */
export type Gid = number & { readonly [gidBrand]: true };

/** The largest valid ID. Linux IDs are unsigned 32-bit numbers, and 2^32 - 1 means "no ID". */
export const MAX_ID = 2 ** 32 - 2;

function checkId(kind: "uid" | "gid", value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_ID) {
    throw new RangeError(`${kind} must be an integer from 0 to 2^32 - 2, got ${String(value)}`);
  }
}

/** Returns `value` as a user ID. Throws a RangeError if it is not an integer from 0 to MAX_ID. */
export function toUid(value: number): Uid {
  checkId("uid", value);
  return value as Uid;
}

/** Returns `value` as a group ID. Throws a RangeError if it is not an integer from 0 to MAX_ID. */
export function toGid(value: number): Gid {
  checkId("gid", value);
  return value as Gid;
}
