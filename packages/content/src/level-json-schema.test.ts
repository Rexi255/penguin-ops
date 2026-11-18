import { describe, expect, test } from "vitest";

import { levelJsonSchema, worldJsonSchema } from "./level-json-schema";

describe("levelJsonSchema", () => {
  test("content/schemas/level.schema.json is up to date (npm run schemas:update updates it)", async () => {
    await expect(`${JSON.stringify(levelJsonSchema(), null, 2)}\n`).toMatchFileSnapshot(
      "../../../content/schemas/level.schema.json",
    );
  });

  test("content/schemas/world.schema.json is up to date (npm run schemas:update updates it)", async () => {
    await expect(`${JSON.stringify(worldJsonSchema(), null, 2)}
`).toMatchFileSnapshot("../../../content/schemas/world.schema.json");
  });

  test("describes the input form of world files for editors", () => {
    expect(worldJsonSchema()).toMatchObject({
      title: "PenguinOps world",
      type: "object",
      additionalProperties: false,
      required: ["format", "id", "hosts"],
      properties: { format: { const: 1 }, hosts: { type: "array", minItems: 1 } },
    });
  });

  test("describes the input form of level.yaml for editors", () => {
    const schema = levelJsonSchema();
    expect(schema).toMatchObject({
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "PenguinOps level",
      type: "object",
      additionalProperties: false,
      required: ["format", "id", "kind", "teaches", "solutions"],
      oneOf: [{ required: ["goal"] }, { required: ["steps"] }],
      properties: {
        format: { const: 1 },
        kind: { enum: ["main", "review", "side", "incident"] },
        extra_goals: { type: "array" },
        goal: { allOf: [{ $ref: "#/definitions/rule" }] },
      },
    });
  });

  test("defines a rule once, with every rule type and exactly one key", () => {
    const definitions = levelJsonSchema()["definitions"];
    expect(definitions).toMatchObject({
      rule: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        maxProperties: 1,
        properties: {
          all: { type: "array", minItems: 1, items: { $ref: "#/definitions/rule" } },
          not: { allOf: [{ $ref: "#/definitions/rule" }] },
        },
      },
    });
    const rule = (definitions as { rule: { properties: object } }).rule;
    expect(Object.keys(rule.properties)).toEqual([
      "cwd_is",
      "exists",
      "file_exists",
      "dir_exists",
      "file_contains",
      "same_content",
      "output_contains",
      "output_matches",
      "all",
      "any",
      "not",
    ]);
  });
});
