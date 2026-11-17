import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { readDecisionsFolder } from "./files.ts";
import {
  AdrError,
  formatNumber,
  indexRecords,
  nextNumber,
  planRecord,
  slugify,
  wrapField,
  type DecisionsFolder,
  type NewRecordRequest,
} from "./record.ts";

const TEMPLATE = [
  "# NNNN. Title in sentence case",
  "",
  "- Status: Proposed | Accepted | Superseded by [NNNN](NNNN-title.md)",
  "- Date: YYYY-MM-DD",
  "- Supersedes: – | [NNNN](NNNN-title.md)",
  "",
  "## Context",
  "",
  "What problem or question led to this decision?",
  "",
].join("\n");

function record(number: string, title: string, status: string): string {
  return [
    `# ${number}. ${title}`,
    "",
    `- Status: ${status}`,
    "- Date: 2026-11-16",
    "- Supersedes: –",
    "",
    "## Context",
    "",
    "Unchanged text.",
    "",
  ].join("\n");
}

function folder(records: Record<string, string>): DecisionsFolder {
  return { template: TEMPLATE, records: new Map(Object.entries(records)) };
}

const RECORDS = folder({
  "0001-record-decisions.md": record("0001", "Record decisions", "Accepted"),
  "0002-old-way.md": record("0002", "Old way", "Superseded by [0003](0003-new-way.md)"),
  "0003-new-way.md": record("0003", "New way", "Accepted"),
  "0004-idea.md": record("0004", "Idea", "Proposed"),
});

function request(overrides: Partial<NewRecordRequest> = {}): NewRecordRequest {
  return { title: "Use the adr skill", date: "2026-11-17", supersedes: [], ...overrides };
}

describe("formatNumber", () => {
  test.each([
    [1, "0001"],
    [38, "0038"],
    [1234, "1234"],
  ])("formats %i as %s", (number, expected) => {
    expect(formatNumber(number)).toBe(expected);
  });
});

describe("slugify", () => {
  test.each([
    ["No branch protection on main", "no-branch-protection-on-main"],
    ["`/adr` skill", "adr-skill"],
    ["TypeScript 7 and Node.js 26", "typescript-7-and-node-js-26"],
    ["The owner's choice", "the-owners-choice"],
    ["Café — déjà vu", "cafe-deja-vu"],
    ["  Spaces   and---hyphens  ", "spaces-and-hyphens"],
  ])("turns %j into %s", (title, expected) => {
    expect(slugify(title)).toBe(expected);
  });

  test("returns an empty string for a title without letters or digits", () => {
    expect(slugify("— ? —")).toBe("");
  });
});

describe("indexRecords", () => {
  test("indexes the files by number", () => {
    expect(indexRecords(["0002-b.md", "0010-c-d.md"])).toEqual(
      new Map([
        [2, "0002-b.md"],
        [10, "0010-c-d.md"],
      ]),
    );
  });

  test.each(["README.md", "38-short-number.md", "0038-Upper-Case.md", "0038-.md", "0038-a--b.md"])(
    "rejects the file name %s",
    (fileName) => {
      expect(() => indexRecords([fileName])).toThrow(AdrError);
    },
  );

  test("rejects two files with the same number", () => {
    expect(() => indexRecords(["0005-a.md", "0005-b.md"])).toThrow(
      '"0005-a.md" and "0005-b.md" have the same number.',
    );
  });
});

describe("nextNumber", () => {
  test("starts at 1 in an empty folder", () => {
    expect(nextNumber(new Map())).toBe(1);
  });

  test("takes one more than the highest number and does not fill gaps", () => {
    expect(
      nextNumber(
        new Map([
          [1, "0001-a.md"],
          [7, "0007-b.md"],
        ]),
      ),
    ).toBe(8);
  });
});

describe("wrapField", () => {
  test("keeps a short value on one line", () => {
    expect(wrapField("Date", "2026-11-17")).toEqual(["- Date: 2026-11-17"]);
  });

  test("wraps at 100 characters with an indent of two spaces", () => {
    const lines = wrapField("Status", "word ".repeat(40).trim());
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length <= 100)).toBe(true);
    expect(lines.slice(1).every((line) => line.startsWith("  ") && line[2] !== " ")).toBe(true);
    expect(lines.join(" ").replace(/\s+/g, " ")).toBe(`- Status: ${"word ".repeat(40).trim()}`);
  });

  test("does not split a word that is longer than a line", () => {
    const long = "x".repeat(120);
    expect(wrapField("Status", `Accepted ${long} end`)).toEqual([
      "- Status: Accepted",
      `  ${long}`,
      "  end",
    ]);
  });
});

describe("planRecord", () => {
  test("creates the record from the template with the next number and status Proposed", () => {
    const plan = planRecord(request(), RECORDS);
    expect(plan.created).toEqual({
      fileName: "0005-use-the-adr-skill.md",
      content: [
        "# 0005. Use the adr skill",
        "",
        "- Status: Proposed",
        "- Date: 2026-11-17",
        "- Supersedes: –",
        "",
        "## Context",
        "",
        "What problem or question led to this decision?",
        "",
      ].join("\n"),
    });
    expect(plan.updated).toEqual([]);
  });

  test("marks a completely superseded record and links it from the new record", () => {
    const plan = planRecord(request({ supersedes: [{ number: 3 }] }), RECORDS);
    expect(plan.created.content).toContain("- Supersedes: [0003](0003-new-way.md)\n");
    expect(plan.updated).toEqual([
      {
        fileName: "0003-new-way.md",
        content: record("0003", "New way", "Superseded by [0005](0005-use-the-adr-skill.md)"),
      },
    ]);
  });

  test("marks a partly superseded record with the scope", () => {
    const plan = planRecord(
      request({ supersedes: [{ number: 1, scope: "  the file names " }] }),
      RECORDS,
    );
    expect(plan.created.content).toContain(
      "- Supersedes: [0001](0001-record-decisions.md) (only the file names)\n",
    );
    expect(plan.updated[0]?.content).toBe(
      record(
        "0001",
        "Record decisions",
        "Accepted; partly superseded by [0005](0005-use-the-adr-skill.md) (the file names)",
      ),
    );
  });

  test("adds to a record that is already partly superseded, across wrapped lines", () => {
    const partly = folder({
      "0001-a.md": [
        "# 0001. A",
        "",
        "- Status: Accepted; partly superseded by [0002](0002-b.md) (a scope that is long enough",
        "  to wrap onto a second line of the status)",
        "- Date: 2026-11-16",
        "- Supersedes: –",
        "",
      ].join("\n"),
      "0002-b.md": record("0002", "B", "Accepted"),
    });
    const plan = planRecord(
      request({ title: "C", supersedes: [{ number: 1, scope: "the second part" }] }),
      partly,
    );
    expect(plan.updated[0]?.content).toBe(
      [
        "# 0001. A",
        "",
        "- Status: Accepted; partly superseded by [0002](0002-b.md) (a scope that is long enough to wrap onto",
        "  a second line of the status) and [0003](0003-c.md) (the second part)",
        "- Date: 2026-11-16",
        "- Supersedes: –",
        "",
      ].join("\n"),
    );
  });

  test("replaces a partial supersede when the rest is superseded too", () => {
    const partly = folder({
      "0001-a.md": record("0001", "A", "Accepted; partly superseded by [0002](0002-b.md) (x)"),
      "0002-b.md": record("0002", "B", "Accepted"),
    });
    const plan = planRecord(request({ title: "C", supersedes: [{ number: 1 }] }), partly);
    expect(plan.updated[0]?.content).toBe(record("0001", "A", "Superseded by [0003](0003-c.md)"));
  });

  test("supersedes several records in the order given", () => {
    const plan = planRecord(
      request({ supersedes: [{ number: 3 }, { number: 1, scope: "the file names" }] }),
      RECORDS,
    );
    expect(plan.updated.map((file) => file.fileName)).toEqual([
      "0003-new-way.md",
      "0001-record-decisions.md",
    ]);
    expect(plan.created.content).toContain(
      "- Supersedes: [0003](0003-new-way.md) and [0001](0001-record-decisions.md) (only the file names)\n",
    );
  });

  test("works in an empty folder", () => {
    expect(planRecord(request(), folder({})).created.fileName).toBe("0001-use-the-adr-skill.md");
  });

  test.each([
    ["an empty title", { title: "" }, "The title is empty."],
    ["a title of spaces", { title: "   " }, "The title is empty."],
    ["a title with leading space", { title: " Title" }, "one line"],
    ["a title with two lines", { title: "Title\nmore" }, "one line"],
    ["a title with double spaces", { title: "A  B" }, "one line"],
    ["a title without letters", { title: "—" }, "no letters or digits"],
    ["a malformed date", { date: "17.11.2026" }, "not a valid date"],
    ["an impossible date", { date: "2026-02-30" }, "not a valid date"],
    ["record number 0", { supersedes: [{ number: 0 }] }, "between 1 and 9999"],
    ["a fractional record number", { supersedes: [{ number: 1.5 }] }, "between 1 and 9999"],
    [
      "a duplicate record",
      { supersedes: [{ number: 1 }, { number: 1, scope: "x" }] },
      "more than once",
    ],
    [
      "an empty scope",
      { supersedes: [{ number: 1, scope: " " }] },
      "scope for record 0001 is empty",
    ],
    ["an unknown record", { supersedes: [{ number: 9 }] }, "There is no record 0009."],
    ["a superseded record", { supersedes: [{ number: 2 }] }, 'status "Superseded by'],
    ["a proposed record", { supersedes: [{ number: 4 }] }, 'status "Proposed"'],
  ] satisfies [string, Partial<NewRecordRequest>, string][])(
    "rejects %s",
    (_name, overrides, message) => {
      expect(() => planRecord(request(overrides), RECORDS)).toThrow(AdrError);
      expect(() => planRecord(request(overrides), RECORDS)).toThrow(message);
    },
  );

  test("rejects a superseded record without a status line", () => {
    const broken = folder({ "0001-a.md": "# 0001. A\n\n- Date: 2026-11-16\n" });
    expect(() => planRecord(request({ supersedes: [{ number: 1 }] }), broken)).toThrow(
      '"0001-a.md" has no "- Status:" line.',
    );
  });

  test("rejects a template without a heading or a field", () => {
    expect(() => planRecord(request(), { ...RECORDS, template: "- Status: x\n" })).toThrow(
      '"template.md" has no "# " heading.',
    );
    expect(() =>
      planRecord(request(), { ...RECORDS, template: TEMPLATE.replace("- Date:", "- When:") }),
    ).toThrow('"template.md" has no "- Date:" line.');
  });

  test("rejects an invalid file name in the folder", () => {
    expect(() => planRecord(request(), folder({ "notes.md": "# Notes\n" }))).toThrow(
      '"notes.md" is not a valid record file name',
    );
  });
});

describe("planRecord with the real records", () => {
  const real = readDecisionsFolder(join(import.meta.dirname, "..", "..", "docs", "decisions"));

  test("the real template and records produce a valid next record", () => {
    const plan = planRecord(request({ title: "Example" }), real);
    const highest = Math.max(...indexRecords(real.records.keys()).keys());
    expect(plan.created.fileName).toBe(`${formatNumber(highest + 1)}-example.md`);
    expect(plan.created.content).toMatch(
      /^# \d{4}\. Example\n\n- Status: Proposed\n- Date: 2026-11-17\n- Supersedes: –\n\n## Context\n/,
    );
  });

  test("reproduces the status line that ADR 0033 gave ADR 0029", () => {
    const before = new Map(
      [...real.records].filter(([fileName]) => Number(fileName.slice(0, 4)) < 33),
    );
    const original = before.get("0029-formatting-linting-and-boundary-enforcement.md");
    if (original === undefined) {
      throw new Error("ADR 0029 is missing.");
    }
    before.set(
      "0029-formatting-linting-and-boundary-enforcement.md",
      original.replace(/- Status: [^]*?\n- Date:/, "- Status: Accepted\n- Date:"),
    );
    const plan = planRecord(
      {
        title: "Electron app structure and preload contract",
        date: "2026-11-17",
        supersedes: [
          { number: 29, scope: "`apps/desktop` may import types from `@penguin-ops/ui`" },
        ],
      },
      { template: real.template, records: before },
    );
    expect(plan.created.fileName).toBe("0033-electron-app-structure-and-preload-contract.md");
    expect(plan.updated[0]?.content).toBe(
      real.records.get("0029-formatting-linting-and-boundary-enforcement.md"),
    );
  });
});
