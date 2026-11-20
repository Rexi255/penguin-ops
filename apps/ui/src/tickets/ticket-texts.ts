// The texts of the ticket being played in the player's language (ROADMAP M3.5a, ADR 0097): its
// title, its text and the messages of its steps and tips, from the level's catalog with English
// where a further language lacks a text (ADR 0074). The game passes no values to level texts.

import {
  type CatalogText,
  type Content,
  formatText,
  levelTexts,
  type RichText,
  type RichTextInline,
} from "@penguin-ops/content";

/** The texts a ticket panel shows for one level. */
export interface TicketTexts {
  /** The level's ID, named in errors. */
  readonly levelId: string;
  /** The ticket's title, one paragraph. */
  readonly title: readonly RichTextInline[];
  /** The ticket's text. */
  readonly ticket: RichText;
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
  return { levelId, title: block.content, ticket: formatText(texts.ticket), texts: texts.texts };
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
