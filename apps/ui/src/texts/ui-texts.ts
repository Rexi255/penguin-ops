// The UI texts of `content/ui/<language>.yaml` (ADR 0012, ADR 0090). `UI_TEXT_PLACEHOLDERS`
// lists every key the UI uses with the names of the values it passes; a test checks that the
// English and German catalogs hold exactly these keys with exactly these placeholders, so a
// catalog text can neither be missing nor wait for a value the UI never passes.

import {
  formatText,
  type MandatoryLanguage,
  type RichText,
  type RichTextInline,
  type TextValue,
  type UiCatalogs,
  uiTexts,
} from "@penguin-ops/content";

/** Every UI text key with the names of its placeholders. */
export const UI_TEXT_PLACEHOLDERS = {
  /** The product name, as the logo's text alternative. */
  "app.name": [],
  /** The accessible name of the start screen's menu. */
  "start.menu": [],
  /** The menu entry that opens the save slot screen. */
  "start.play": [],
  /** The menu entry that closes the game. */
  "start.quit": [],
  /** The version line of the start screen; `version` is a code value. */
  "start.version": ["version"],
  /** The title of the save slot screen. */
  "slots.title": [],
  /** The name of a save slot; `number` counts from 1. */
  "slots.slot": ["number"],
  /** The state of a slot without a saved game. */
  "slots.empty": [],
  /** The button that returns from the save slot screen to the start screen. */
  "slots.back": [],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** A key of a UI text. */
export type UiTextKey = keyof typeof UI_TEXT_PLACEHOLDERS;

type PlaceholderName<K extends UiTextKey> = (typeof UI_TEXT_PLACEHOLDERS)[K][number];

/** The values a text needs: none, or one for each of its placeholders. */
export type UiTextValues<K extends UiTextKey> = [PlaceholderName<K>] extends [never]
  ? []
  : [values: Readonly<Record<PlaceholderName<K>, TextValue>>];

/** The UI texts in the game's language. */
export interface Texts {
  readonly language: MandatoryLanguage;
  /** A text with its markup, for running text and labels with code. */
  readonly rich: <K extends UiTextKey>(key: K, ...values: UiTextValues<K>) => RichText;
  /**
   * A text without markup, for attributes such as `alt` and `aria-label`. The text must be one
   * paragraph; code and bold become plain text.
   */
  readonly plain: <K extends UiTextKey>(key: K, ...values: UiTextValues<K>) => string;
}

/** The UI texts of the loaded catalogs in a language. */
export function createTexts(catalogs: UiCatalogs, language: MandatoryLanguage): Texts {
  const texts = uiTexts(catalogs, language);
  const rich = <K extends UiTextKey>(key: K, ...values: UiTextValues<K>): RichText => {
    const text = texts.get(key);
    if (text === undefined) {
      throw new Error(`The UI catalog "${language}" has no text "${key}".`);
    }
    return formatText(text, values[0] ?? {});
  };
  return {
    language,
    rich,
    plain: (key, ...values) => plainText(paragraphOf(rich(key, ...values), key)),
  };
}

/** The inline content of a text that must be one paragraph, such as a label. */
export function paragraphOf(text: RichText, key: string): readonly RichTextInline[] {
  const [block, ...rest] = text;
  if (block?.type !== "paragraph" || rest.length > 0) {
    throw new Error(`The UI text "${key}" must be one paragraph.`);
  }
  return block.content;
}

function plainText(inlines: readonly RichTextInline[]): string {
  return inlines
    .map((inline) => {
      switch (inline.type) {
        case "text":
        case "code":
          return inline.text;
        case "bold":
          return plainText(inline.children);
        case "break":
          return "\n";
      }
    })
    .join("");
}
