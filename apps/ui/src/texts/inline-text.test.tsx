import type { RichText } from "@penguin-ops/content";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { InlineText } from "./inline-text";

describe("InlineText", () => {
  test("draws text, code, bold and line breaks without a wrapping element", () => {
    const text: RichText = [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Run " },
          { type: "code", text: "ls <dir>" },
          { type: "break" },
          {
            type: "bold",
            children: [
              { type: "text", text: "now " },
              { type: "code", text: "-l" },
            ],
          },
        ],
      },
    ];
    expect(renderToStaticMarkup(<InlineText text={text} textKey="a.b" />)).toBe(
      "Run <code>ls &lt;dir&gt;</code><br/><strong>now <code>-l</code></strong>",
    );
  });

  test("rejects a text of more than one block", () => {
    const text: RichText = [
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "list", items: [[{ type: "text", text: "b" }]] },
    ];
    expect(() => renderToStaticMarkup(<InlineText text={text} textKey="a.b" />)).toThrow(
      'The UI text "a.b" must be one paragraph.',
    );
  });
});
