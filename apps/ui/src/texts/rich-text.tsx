// Draws a formatted text of several blocks (ADR 0073), such as a ticket text: each paragraph as a
// `p`, each list as a `ul`, with the inline markup of `InlineText`. Texts are never read as HTML.

import type { RichText } from "@penguin-ops/content";

import { Inlines } from "./inline-text";

export interface RichTextBlocksProps {
  readonly text: RichText;
}

/** The blocks of a formatted text, without a wrapping element. */
export function RichTextBlocks({ text }: RichTextBlocksProps) {
  // The blocks never change order while the text stays the same, so the index is a stable key.
  return text.map((block, index) => {
    switch (block.type) {
      case "paragraph":
        return (
          <p key={index}>
            <Inlines inlines={block.content} />
          </p>
        );
      case "list":
        return (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inlines inlines={item} />
              </li>
            ))}
          </ul>
        );
    }
  });
}
