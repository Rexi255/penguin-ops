// Draws a UI text that is one paragraph, such as a label or a single line, with its markup
// (ADR 0073): code in the monospace face, bold, and line breaks. Texts are never read as HTML.

import type { RichText, RichTextInline } from "@penguin-ops/content";

import { paragraphOf } from "./ui-texts";

export interface InlineTextProps {
  /** The formatted text; it must be one paragraph. */
  readonly text: RichText;
  /** The text's key, named in the error if the text is not one paragraph. */
  readonly textKey: string;
}

/** The inline content of a one-paragraph text, without a wrapping element. */
export function InlineText({ text, textKey }: InlineTextProps) {
  return <Inlines inlines={paragraphOf(text, textKey)} />;
}

function Inlines({ inlines }: { readonly inlines: readonly RichTextInline[] }) {
  // The pieces never change order while the text stays the same, so the index is a stable key.
  return inlines.map((inline, index) => {
    switch (inline.type) {
      case "text":
        return inline.text;
      case "code":
        return <code key={index}>{inline.text}</code>;
      case "bold":
        return (
          <strong key={index}>
            <Inlines inlines={inline.children} />
          </strong>
        );
      case "break":
        return <br key={index} />;
    }
  });
}
