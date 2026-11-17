import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { readDecisionsFolder, writePlan } from "./files.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "adr-"));
  writeFileSync(join(folder, "template.md"), "# NNNN. Title\n");
  writeFileSync(join(folder, "0001-a.md"), "# 0001. A\n");
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe("readDecisionsFolder", () => {
  test("reads the template and the Markdown records, nothing else", () => {
    writeFileSync(join(folder, "notes.txt"), "not a record");
    mkdirSync(join(folder, "images"));
    expect(readDecisionsFolder(folder)).toEqual({
      template: "# NNNN. Title\n",
      records: new Map([["0001-a.md", "# 0001. A\n"]]),
    });
  });

  test("fails without a template", () => {
    rmSync(join(folder, "template.md"));
    expect(() => readDecisionsFolder(folder)).toThrow(/template\.md/);
  });
});

describe("writePlan", () => {
  test("writes the new record and the updated records", () => {
    writePlan(folder, {
      created: { fileName: "0002-b.md", content: "new" },
      updated: [{ fileName: "0001-a.md", content: "updated" }],
    });
    expect(readFileSync(join(folder, "0002-b.md"), "utf8")).toBe("new");
    expect(readFileSync(join(folder, "0001-a.md"), "utf8")).toBe("updated");
  });

  test("never overwrites an existing file and then leaves the other records untouched", () => {
    writeFileSync(join(folder, "0002-b.md"), "existing");
    expect(() => {
      writePlan(folder, {
        created: { fileName: "0002-b.md", content: "new" },
        updated: [{ fileName: "0001-a.md", content: "updated" }],
      });
    }).toThrow(/EEXIST/);
    expect(readFileSync(join(folder, "0002-b.md"), "utf8")).toBe("existing");
    expect(readFileSync(join(folder, "0001-a.md"), "utf8")).toBe("# 0001. A\n");
  });
});

describe("npm run adr:new", () => {
  const script = join(import.meta.dirname, "..", "new-adr.ts");

  test("prints the usage and exits with code 1 for invalid arguments, without writing", () => {
    const before = readdirSync(join(import.meta.dirname, "..", "..", "docs", "decisions"));
    let failure: unknown;
    try {
      execFileSync(process.execPath, [script, "--supersedes", "1"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      status: 1,
      stderr: expect.stringContaining("The title is missing.") as unknown,
    });
    expect(failure).toMatchObject({
      stderr: expect.stringContaining("Usage: npm run adr:new") as unknown,
    });
    expect(readdirSync(join(import.meta.dirname, "..", "..", "docs", "decisions"))).toEqual(before);
  });
});
