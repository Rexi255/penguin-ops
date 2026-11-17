import { describe, expect, test } from "vitest";

import { createCommandLookup } from "../command-registry";
import { COMMANDS } from ".";

describe("COMMANDS", () => {
  test("has unique names, sorted, that the lookup finds", () => {
    const names = COMMANDS.map((command) => command.name);
    expect(names).toEqual([...names].sort());
    const lookup = createCommandLookup(COMMANDS);
    for (const command of COMMANDS) {
      expect(lookup(command.name)).toBe(command.run);
    }
  });
});
