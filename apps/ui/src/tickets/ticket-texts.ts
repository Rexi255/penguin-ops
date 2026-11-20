// The texts of the ticket being played in the player's language (ROADMAP M3.5a, ADR 0097): its
// title, its text and the messages of its steps and tips, and its hints and the explanation after
// solving (M3.5b, ADR 0098), from the level's catalog with English where a further language lacks
// a text (ADR 0074). The game passes no values to level texts.

import {
  type CatalogText,
  type Content,
  formatText,
  levelTexts,
  type RichText,
  type RichTextInline,
} from "@penguin-ops/content";

/** A row of the explanation's option table: a literal command and what it does. */
export interface ExplanationOption {
  readonly option: string;
  readonly description: RichText;
}

/** The explanation shown after the ticket is solved. */
export interface ExplanationTexts {
  readonly text: RichText;
  /** Options of the taught command, possibly none. */
  readonly options: readonly ExplanationOption[];
  /** A literal command to try. */
  readonly example?: string;
}

/** The texts a ticket panel shows for one level. */
export interface TicketTexts {
  /** The level's ID, named in errors. */
  readonly levelId: string;
  /** The ticket's title, one paragraph. */
  readonly title: readonly RichTextInline[];
  /** The ticket's text. */
  readonly ticket: RichText;
  /** The three hints: a tip, a concrete tip and the solution. */
  readonly hints: readonly [tip: RichText, concreteTip: RichText, solution: RichText];
  readonly explanation: ExplanationTexts;
  /** The level's other texts by their keys: step messages, tips and prose file contents. */
  readonly texts: ReadonlyMap<string, CatalogText>;
}

/**
 * The texts of the level `levelId` of `content` in `language`. Throws if the content has no
 * such level or if the title is more than one paragraph.
 */
export function ticketTexts(content: Content, levelId: string, language: string): TicketTexts {
  const catalogs = content.levelCatalogs.get(levelId);
  if (catalogs === undefined) {
    throw new Error(`The content has no texts for the level "${levelId}".`);
  }
  const texts = levelTexts(catalogs, language);
  const title = formatText(texts.title);
  const [block, ...rest] = title;
  if (block?.type !== "paragraph" || rest.length > 0) {
    throw new Error(`The title of the level "${levelId}" must be one paragraph.`);
  }
  const [tip, concreteTip, solution] = texts.hints;
  const { explanation } = texts;
  return {
    levelId,
    title: block.content,
    ticket: formatText(texts.ticket),
    hints: [formatText(tip), formatText(concreteTip), formatText(solution)],
    explanation: {
      text: formatText(explanation.text),
      options: explanation.options.map(({ option, description }) => ({
        option,
        description: formatText(description),
      })),
      ...(explanation.example === undefined ? {} : { example: explanation.example }),
    },
    texts: texts.texts,
  };
}

/**
 * The formatted text of a step message or a tip by its key. Throws if the level has no such
 * text, which the content tests rule out for every key the level's rules say.
 */
export function messageText(texts: TicketTexts, say: string): RichText {
  const text = texts.texts.get(say);
  if (text === undefined) {
    throw new Error(`The level "${texts.levelId}" has no text "${say}".`);
  }
  return formatText(text);
}
