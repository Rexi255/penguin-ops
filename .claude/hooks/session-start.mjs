// SessionStart hook: prints the current git state so Claude knows it at the start of every
// session. Plain stdout is added to Claude's context. Runs with `node` in exec form, so it
// works on Windows and Linux. It must never fail: every error is caught and the script
// always exits with code 0.

import { execFileSync } from "node:child_process";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trimEnd(); // keep leading spaces: they are meaningful in `git status --porcelain`
  } catch {
    return null;
  }
}

const lines = ["Git context (SessionStart hook):"];

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch === null) {
  lines.push("- Not a git repository or git is not available.");
} else {
  lines.push(`- Branch: ${branch}`);

  const status = git(["status", "--porcelain=v1"]);
  const changed = status ? status.split("\n").filter(Boolean) : [];
  if (changed.length === 0) {
    lines.push("- Working tree: clean");
  } else {
    lines.push(`- Uncommitted changes: ${changed.length} file(s)`);
    for (const entry of changed.slice(0, 10)) lines.push(`  ${entry}`);
    if (changed.length > 10) lines.push(`  … and ${changed.length - 10} more`);
  }

  const ahead = git(["rev-list", "--count", "origin/main..HEAD"]);
  if (ahead !== null && branch !== "main") {
    lines.push(`- Commits on this branch not in origin/main: ${ahead}`);
  }

  const log = git(["log", "--oneline", "-n", "5"]);
  if (log) {
    lines.push("- Last commits:");
    for (const entry of log.split("\n")) lines.push(`  ${entry}`);
  }
}

process.stdout.write(lines.join("\n") + "\n");
process.exit(0);
