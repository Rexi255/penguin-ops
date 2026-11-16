// Lists the files a change touches, with Git (ADR 0036).
import { execFileSync } from "node:child_process";

/** Git's name for "no commit", used as the previous commit of a push that creates a branch. */
const NO_COMMIT = /^0+$/;

/**
 * Returns the files changed between the merge base of `base` and `head`, and `head`. For a push
 * that creates a branch (`base` is all zeros), returns the files of the commit `head` alone.
 */
export function changedFiles(base: string, head: string, cwd: string): string[] {
  const range = NO_COMMIT.test(base) ? [`${head}^`, head] : [`${base}...${head}`];
  // "--" marks the end of the revisions; stderr becomes part of the error message.
  const output = execFileSync("git", ["diff", "--name-only", "--no-renames", ...range, "--"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.split("\n").filter((line) => line !== "");
}
