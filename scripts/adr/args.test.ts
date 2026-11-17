import { describe, expect, test } from "vitest";

import { parseAdrArguments } from "./args.ts";
import { AdrError } from "./record.ts";

describe("parseAdrArguments", () => {
  test("reads the title", () => {
    expect(parseAdrArguments(["Use the adr skill"])).toEqual({
      title: "Use the adr skill",
      supersedes: [],
    });
  });

  test("reads complete and partial supersedes, also repeated", () => {
    expect(
      parseAdrArguments([
        "Title",
        "--supersedes",
        "27",
        "--partly",
        "0005: the list of approved exceptions",
        "--supersedes=0016",
        "--partly=15:the split: Linux and Windows",
      ]),
    ).toEqual({
      title: "Title",
      supersedes: [
        { number: 27 },
        { number: 16 },
        { number: 5, scope: "the list of approved exceptions" },
        { number: 15, scope: "the split: Linux and Windows" },
      ],
    });
  });

  test.each([
    ["no title", [], "The title is missing."],
    ["a title in several arguments", ["Use", "adr"], "Put the title in quotes"],
    ["an unknown option", ["Title", "--force"], "--force"],
    ["an option without a value", ["Title", "--supersedes"], "--supersedes"],
    [
      "a record number with letters",
      ["Title", "--supersedes", "27a"],
      '"27a" is not a record number.',
    ],
    ["a record number with five digits", ["Title", "--supersedes", "12345"], "not a record number"],
    ["a negative record number", ["Title", "--supersedes=-1"], "not a record number"],
    ["--partly without a colon", ["Title", "--partly", "27"], 'needs the form "<number>:<scope>"'],
    ["--partly without a number", ["Title", "--partly", ":scope"], '"" is not a record number.'],
  ])("rejects %s", (_name, args, message) => {
    expect(() => parseAdrArguments(args)).toThrow(AdrError);
    expect(() => parseAdrArguments(args)).toThrow(message);
  });
});
