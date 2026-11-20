// The UI texts of `content/ui/<language>.yaml` (ADR 0012, ADR 0090). `UI_TEXT_PLACEHOLDERS`
// lists every key the UI uses with the names of the values it passes; a test checks that the
// English and German catalogs hold exactly these keys with exactly these placeholders, so a
// catalog text can neither be missing nor wait for a value the UI never passes. The chapter
// titles in the group `chapters` are content: the content loader checks them against the
// chapters (ADR 0099).

import {
  chapterTitleKey,
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
  /** The label of the F1 key in key hints. */
  "keys.f1": [],
  /** The label of the Esc key in key hints. */
  "keys.escape": [],
  /** The label of the Tab key in key hints. */
  "keys.tab": [],
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
  /** The state of a slot without a saved game, which starts a new game. */
  "slots.new-game": [],
  /** The state of a slot with a game; `player` is the player's name, `mode` the mode's name. */
  "slots.game": ["player", "mode"],
  /** The button that returns from the save slot screen to the start screen. */
  "slots.back": [],
  /** The name of the Story mode (ADR 0017), shown as "Career": its card title and on a slot. */
  "modes.story": [],
  /** What the Story mode is, on its card. */
  "modes.story-description": [],
  /** The name of the Sandbox mode (ADR 0017): its card title and on a slot. */
  "modes.sandbox": [],
  /** What the Sandbox mode is, on its card. */
  "modes.sandbox-description": [],
  /** The title of the new game screen. */
  "new-game.title": [],
  /** The label of the player's name. */
  "new-game.player-name": [],
  /** The problem of an empty player name. */
  "new-game.player-name-empty": [],
  /** The problem of a too long player name; `max` is the number of characters allowed. */
  "new-game.player-name-too-long": ["max"],
  /** The label of the Linux user name. */
  "new-game.user-name": [],
  /** What the user name is for and which characters it takes. */
  "new-game.user-name-help": [],
  /** The user name problem `empty` (ADR 0093). */
  "new-game.user-name-empty": [],
  /** The user name problem `too-long`; `max` is the number of characters allowed. */
  "new-game.user-name-too-long": ["max"],
  /** The user name problem `uppercase`. */
  "new-game.user-name-uppercase": [],
  /** The user name problem `invalid-character`. */
  "new-game.user-name-invalid-character": [],
  /** The user name problem `invalid-start`. */
  "new-game.user-name-invalid-start": [],
  /** The user name problem `reserved`; `name` is the user name as a code value. */
  "new-game.user-name-reserved": ["name"],
  /** The legend of the game mode choice. */
  "new-game.mode": [],
  /** That the mode cannot be changed later. */
  "new-game.mode-fixed": [],
  /** The button that creates the game and opens the game screen. */
  "new-game.start": [],
  /** The button that returns to the save slot screen. */
  "new-game.back": [],
  /** The game screen's level 1 heading, hidden from sight. */
  "game.title": [],
  /** The accessible name of the side panel. */
  "game.side-panel": [],
  /** The accessible name of the terminal area. */
  "game.terminal": [],
  /** The accessible name of the side panel's row of tabs. */
  "game.panels": [],
  /** The side panel tab of the tickets. */
  "game.tickets": [],
  /** The side panel tab of the mail. */
  "game.mail": [],
  /** The side panel tab of the handbook. */
  "game.handbook": [],
  /** The mail panel while no mail has arrived. */
  "game.mail-empty": [],
  /** The handbook panel while the player has learned no command. */
  "game.handbook-empty": [],
  /** The key hint that shows the next hint of the ticket, after the key's label. */
  "game.hint": [],
  /** The key hint of the terminal's Tab completion, after the key's label. */
  "game.complete": [],
  /** The key hint that opens the pause menu, after the key's label. */
  "game.menu": [],
  /** Where the player is in a ticket with steps; `current` counts from 1, `count` is the total. */
  "ticket.step": ["current", "count"],
  /** The state of a solved ticket. */
  "ticket.solved": [],
  /** The heading of the messages about the ticket: completed steps and tips. */
  "ticket.updates": [],
  /** What a message about a completed step is, for screen readers before its text. */
  "ticket.step-done": [],
  /** What a tip for a typical mistake is, for screen readers before its text. */
  "ticket.tip": [],
  /** The heading of the ticket's extra goals (ADR 0100). */
  "ticket.extra-goals": [],
  /** The bonus XP of an extra goal; `xp` is a number. */
  "ticket.xp": ["xp"],
  /** The state of an extra goal the player has not reached yet. */
  "ticket.extra-goal-open": [],
  /** The state of a reached extra goal. */
  "ticket.extra-goal-reached": [],
  /** The label of a message about a reached extra goal, before its description. */
  "ticket.extra-goal-done": [],
  /** The heading of the hints the player asked for. */
  "ticket.hints": [],
  /** The label of a hint; `number` counts from 1, `count` is the number of hints. */
  "ticket.hint": ["number", "count"],
  /** The heading of the explanation shown after the ticket is solved. */
  "ticket.explanation": [],
  /** The heading of the explanation's variants of the taught command and what they do. */
  "ticket.options": [],
  /** The label before the explanation's command to try. */
  "ticket.example": [],
  /** The heading of the chapter inbox, the list of the open chapters' tickets (ADR 0099). */
  "inbox.title": [],
  /** How many tickets of a chapter are solved; `solved` and `count` are numbers. */
  "inbox.progress": ["solved", "count"],
  /** The state of a ticket the player has not opened yet. */
  "inbox.new": [],
  /** The state of a ticket the player has opened and not solved yet. */
  "inbox.started": [],
  /** The button above a ticket that shows the inbox. */
  "inbox.back": [],
  /** The heading of the ticket offered after a solved one. */
  "inbox.next": [],
  /** Before the title of a chapter that solving the ticket opened. */
  "inbox.chapter-open": [],
  /** Instead of a next ticket, when every ticket of the open chapters is solved. */
  "inbox.all-solved": [],
  /** The accessible name of the terminal's screen, a log of its lines. */
  "terminal.output": [],
  /** The accessible name of the terminal's input line. */
  "terminal.input": [],
  /**
   * A game notice in the terminal: the input used something the game does not simulate yet, and
   * the input stopped there. ROADMAP M3.6 gives each kind of notice its own text.
   */
  "terminal.notice": [],
  /** The title of the pause menu. */
  "pause.title": [],
  /** The pause menu entry that closes the menu and returns to the game. */
  "pause.continue": [],
  /** The pause menu entry that leaves the game for the start screen. */
  "pause.main-menu": [],
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
  /**
   * The title of the chapter `chapterId`, one paragraph without placeholders (ADR 0099). The
   * content loader makes sure that every chapter has one.
   */
  readonly chapterTitle: (chapterId: string) => readonly RichTextInline[];
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
    chapterTitle: (chapterId) => {
      const key = chapterTitleKey(chapterId);
      const text = texts.get(key);
      if (text === undefined) {
        throw new Error(`The UI catalog "${language}" has no title of the chapter "${chapterId}".`);
      }
      return paragraphOf(formatText(text), key);
    },
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
