// Guards the setup of the impeccable design skill (ADR 0039, ADR 0080): the skill is pinned to
// one release, its engine version has a checksum for every platform, telemetry is off for the
// whole project, no impeccable hook or subagent is installed, and the launcher keeps the line
// endings it needs on Windows and Linux.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const SKILL = join(ROOT, ".claude", "skills", "impeccable");
const SCRIPTS = join(SKILL, "scripts");

/** The pinned release (git tag `cli-v4.9.1`). Change it only together with a deliberate update. */
const PINNED_SKILL_VERSION = "4.9.1";

/** Engine assets the launchers download; each needs a checksum for the pinned engine version. */
const ENGINE_ASSETS = [
  "impeccable-darwin-arm64",
  "impeccable-darwin-x64",
  "impeccable-linux-x64",
  "impeccable-linux-arm64",
  "impeccable-windows-x64.exe",
];

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** The `version:` field of a SKILL.md front matter, or `undefined` when there is none. */
function skillVersion(skillMd: string): string | undefined {
  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd)?.[1];
  if (frontMatter === undefined) {
    return undefined;
  }
  return /^version:\s*(\S+)\s*$/m.exec(frontMatter)?.[1];
}

/** Assets with a checksum for `version` in an `engine-checksums.txt` ("<version> <asset> <sha256>"). */
function checksummedAssets(manifest: string, version: string): string[] {
  return manifest
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/))
    .filter(
      ([lineVersion, , digest]) => lineVersion === version && /^[0-9a-f]{64}$/.test(digest ?? ""),
    )
    .map(([, asset]) => asset ?? "");
}

/** Hook commands in a Claude Code settings object that mention impeccable. */
function impeccableHookCommands(settings: unknown): string[] {
  const found: string[] = [];
  const visit = (value: unknown, insideHooks: boolean): void => {
    if (typeof value === "string") {
      if (insideHooks && value.toLowerCase().includes("impeccable")) {
        found.push(value);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        visit(item, insideHooks);
      });
    } else if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, insideHooks || key === "hooks");
      }
    }
  };
  visit(settings, false);
  return found;
}

describe("impeccable setup helpers", () => {
  it("reads the version from the front matter only", () => {
    expect(skillVersion("---\nname: x\nversion: 1.2.3\n---\nversion: 9.9.9\n")).toBe("1.2.3");
    expect(skillVersion("---\r\nversion: 1.2.3\r\n---\r\n")).toBe("1.2.3");
    expect(skillVersion("---\nname: x\n---\nversion: 9.9.9\n")).toBeUndefined();
    expect(skillVersion("version: 1.2.3\n")).toBeUndefined();
  });

  it("lists only the assets with a valid checksum for the asked version", () => {
    const digest = "a".repeat(64);
    const manifest = [
      "# comment 0.1.0 impeccable-linux-x64 " + digest,
      `0.1.0 impeccable-linux-x64 ${digest}`,
      `0.1.1 impeccable-darwin-x64 ${digest}`,
      "0.1.0 impeccable-darwin-arm64 not-a-digest",
      "",
    ].join("\n");
    expect(checksummedAssets(manifest, "0.1.0")).toEqual(["impeccable-linux-x64"]);
    expect(checksummedAssets(manifest, "0.2.0")).toEqual([]);
  });

  it("finds impeccable commands inside hooks but not elsewhere", () => {
    const settings = {
      env: { NOTE: "impeccable" },
      hooks: {
        PostToolUse: [
          { matcher: "Edit", hooks: [{ type: "command", command: "scripts/impeccable hook" }] },
        ],
        SessionStart: [{ hooks: [{ type: "command", command: "node", args: ["start.mjs"] }] }],
      },
    };
    expect(impeccableHookCommands(settings)).toEqual(["scripts/impeccable hook"]);
    expect(impeccableHookCommands({ env: { NOTE: "impeccable" } })).toEqual([]);
  });
});

describe("impeccable setup", () => {
  it("is pinned to one release and keeps its license files", () => {
    expect(skillVersion(read(join(SKILL, "SKILL.md")))).toBe(PINNED_SKILL_VERSION);
    expect(read(join(SKILL, "LICENSE"))).toContain("Apache License");
    expect(existsSync(join(SKILL, "NOTICE.md"))).toBe(true);
  });

  it("has a checksum for every engine download of the pinned engine version", () => {
    const engineVersion = read(join(SCRIPTS, "VERSION")).trim();
    expect(engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
    const assets = checksummedAssets(read(join(SCRIPTS, "engine-checksums.txt")), engineVersion);
    expect([...assets].sort()).toEqual([...ENGINE_ASSETS].sort());
  });

  it("turns telemetry off for the whole project", () => {
    const config: unknown = JSON.parse(read(join(ROOT, ".impeccable", "config.json")));
    expect(config).toMatchObject({ telemetry: false });
  });

  it("installs no impeccable hook and no impeccable subagent", () => {
    const settings: unknown = JSON.parse(read(join(ROOT, ".claude", "settings.json")));
    expect(impeccableHookCommands(settings)).toEqual([]);
    const agents = join(ROOT, ".claude", "agents");
    const impeccableAgents = existsSync(agents)
      ? readdirSync(agents).filter((name) => name.startsWith("impeccable"))
      : [];
    expect(impeccableAgents).toEqual([]);
  });

  it("keeps LF in the POSIX launcher and CRLF in the Windows launcher", () => {
    expect(read(join(SCRIPTS, "impeccable"))).not.toContain("\r");
    const cmd = read(join(SCRIPTS, "impeccable.cmd"));
    expect(cmd.split("\n").length).toBeGreaterThan(1);
    expect(cmd.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("keeps engine binaries and impeccable's runtime state out of git", () => {
    const gitignore = read(join(ROOT, ".gitignore"));
    expect(gitignore).toContain("**/skills/impeccable/scripts/bin/");
    expect(gitignore).toContain("# impeccable-ignore-start");
    expect(gitignore).toContain("**/.impeccable/config.local.json");
    expect(gitignore).toContain("# impeccable-ignore-end");
  });
});
