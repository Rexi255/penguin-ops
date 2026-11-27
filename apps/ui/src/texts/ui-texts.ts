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
  /** The menu entry that opens the settings (ADR 0109). */
  "start.settings": [],
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
  /** How many tickets a slot's game has solved; `count` is a number. */
  "slots.solved": ["count"],
  /** The play time of a slot's game under an hour; `minutes` is a number. */
  "slots.play-time-minutes": ["minutes"],
  /** The play time of a slot's game from an hour; `hours` and `minutes` are numbers. */
  "slots.play-time-hours": ["hours", "minutes"],
  /** When a slot's game was last played; `date` is the date and time in the player's language. */
  "slots.last-played": ["date"],
  /** The state of a slot whose save and backup cannot be read (ADR 0106). */
  "slots.damaged": [],
  /** The state of a slot whose save a newer version of the game wrote. */
  "slots.too-new": [],
  /** The state of a slot whose user name the game's worlds now hold. */
  "slots.user-name-taken": [],
  /** The accessible name of a slot's menu and its button; `number` counts from 1. */
  "slots.actions": ["number"],
  /** The slot menu entry that exports a slot's game to a file (ADR 0107). */
  "slots.export": [],
  /** The slot menu entry that imports a file into a slot. */
  "slots.import": [],
  /** The slot menu entry and the dialog button that delete a slot. */
  "slots.delete": [],
  /** The question before a slot is deleted; `number` counts from 1. */
  "slots.delete-title": ["number"],
  /** What deleting a slot with a game does; `player` is the player's name. */
  "slots.delete-game": ["player"],
  /** What deleting a slot whose save cannot be played does. */
  "slots.delete-save": [],
  /** The dialog button that keeps the slot. */
  "slots.cancel": [],
  /** The message after a slot was deleted; `number` counts from 1. */
  "slots.deleted": ["number"],
  /** The message when a slot could not be deleted; `number` counts from 1. */
  "slots.delete-failed": ["number"],
  /** The title of the system's dialog that exports a slot; `number` counts from 1. */
  "slots.export-title": ["number"],
  /** The title of the system's dialog that imports into a slot; `number` counts from 1. */
  "slots.import-title": ["number"],
  /** The name of the save file type in the system's file dialogs. */
  "slots.file-type": [],
  /** The message after a slot was exported; `number` counts from 1. */
  "slots.exported": ["number"],
  /** The message when a slot could not be exported; `number` counts from 1. */
  "slots.export-failed": ["number"],
  /** The message after a game was imported; `number` counts from 1. */
  "slots.imported": ["number"],
  /** The message when a file could not be read or the game not written; `number` from 1. */
  "slots.import-failed": ["number"],
  /** The import problem `not-a-save`; `number` counts from 1. */
  "slots.import-not-a-save": ["number"],
  /** The import problem `damaged`; `number` counts from 1. */
  "slots.import-damaged": ["number"],
  /** The import problem `too-new`; `number` counts from 1. */
  "slots.import-too-new": ["number"],
  /** The import problem `user-name-taken`; `number` counts from 1. */
  "slots.import-user-name-taken": ["number"],
  /** The question before an import replaces a slot's save; `number` counts from 1. */
  "slots.replace-title": ["number"],
  /** What the import does to a slot with a game; `player` and `imported` are players' names. */
  "slots.replace-game": ["player", "imported"],
  /** What the import does to a slot whose save cannot be played; `imported` is a player's name. */
  "slots.replace-save": ["imported"],
  /** The dialog button that replaces a slot's save with the imported game. */
  "slots.replace": [],
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
  /** The footer's alert while the game's latest save failed (ADR 0106). */
  "game.not-saved": [],
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
  /** What the game command `hint` shows once every hint of the ticket is shown (ADR 0103). */
  "terminal.no-more-hints": [],
  /*
   * The game notices in the terminal (ADR 0102): the input used something the game does not
   * simulate yet, and the input stopped there. `command` is the command name as the player wrote
   * it, `option` and `variable` what the command met; all three are code values.
   */
  /** The command notice `option-not-simulated`. */
  "notices.option-not-simulated": ["command", "option"],
  /** The command notice `variable-not-simulated`. */
  "notices.variable-not-simulated": ["command", "variable"],
  /** The command notice `invalid-utf8-not-simulated`. */
  "notices.invalid-utf8-not-simulated": ["command"],
  /** The command notice `terminal-input-not-simulated`. */
  "notices.terminal-input-not-simulated": ["command"],
  /** The command notice `game-output-not-simulated` (ADR 0103). */
  "notices.game-output-not-simulated": ["command"],
  /** The shell features the game does not simulate yet, one text each, named by the feature. */
  "notices.command-substitution": [],
  "notices.arithmetic-expansion": [],
  "notices.parameter-expansion": [],
  "notices.process-substitution": [],
  "notices.ansi-c-quoting": [],
  "notices.locale-quoting": [],
  "notices.history-expansion": [],
  "notices.background-job": [],
  "notices.subshell": [],
  "notices.arithmetic-command": [],
  "notices.stderr-pipe": [],
  "notices.here-document": [],
  "notices.here-string": [],
  "notices.fd-duplication": [],
  "notices.output-and-error-redirection": [],
  "notices.read-write-redirection": [],
  "notices.clobber-redirection": [],
  "notices.pipeline-negation": [],
  "notices.time-keyword": [],
  "notices.if-clause": [],
  "notices.while-loop": [],
  "notices.until-loop": [],
  "notices.for-loop": [],
  "notices.select-loop": [],
  "notices.case-clause": [],
  "notices.command-group": [],
  "notices.conditional-command": [],
  "notices.function-definition": [],
  "notices.coprocess": [],
  "notices.array": [],
  "notices.process-id": [],
  "notices.shell-options": [],
  "notices.file-descriptor": [],
  "notices.reversed-redirection": [],
  "notices.command-path": [],
  /** The game command `help` without operands: the game's overview (ADR 0103). */
  "help.overview": [],
  /** The label before the list of the commands the game simulates, in `help`'s overview. */
  "help.commands": [],
  /** `help NAME` for a name the game does not simulate; `topic` is the name as a code value. */
  "help.unknown": ["topic"],
  /*
   * `help NAME`: what each command the game simulates does, by its name. A test checks that
   * every command has one (`helpTopicKey`).
   */
  "help-topics.cat": [],
  "help-topics.cd": [],
  "help-topics.clear": [],
  "help-topics.cp": [],
  "help-topics.echo": [],
  "help-topics.grep": [],
  "help-topics.head": [],
  "help-topics.help": [],
  "help-topics.hint": [],
  "help-topics.history": [],
  "help-topics.ls": [],
  "help-topics.mkdir": [],
  "help-topics.mv": [],
  "help-topics.pwd": [],
  "help-topics.rm": [],
  "help-topics.tail": [],
  "help-topics.touch": [],
  "help-topics.whoami": [],
  /** The title of the pause menu. */
  "pause.title": [],
  /** The pause menu entry that closes the menu and returns to the game. */
  "pause.continue": [],
  /** The pause menu entry that opens the settings (ADR 0109). */
  "pause.settings": [],
  /** The pause menu entry that leaves the game for the start screen. */
  "pause.main-menu": [],
  /** The title of the settings, a screen from the main menu and a dialog in the game. */
  "settings.title": [],
  /** The name of the group of the language choice. */
  "settings.language": [],
  /** The choice of the system's language; `language` is the name of the language it gives. */
  "settings.language-system": ["language"],
  /** The choice of English, named in English in every language. */
  "settings.language-en": [],
  /** The choice of German, named in German in every language. */
  "settings.language-de": [],
  /** The name of the English language in the player's language. */
  "languages.en": [],
  /** The name of the German language in the player's language. */
  "languages.de": [],
  /** The name of the group of the screen settings: fullscreen and the font size. */
  "settings.display": [],
  /** The switch of fullscreen. */
  "settings.fullscreen": [],
  /** The help line of the fullscreen switch: F11 toggles it everywhere. */
  "settings.fullscreen-help": [],
  /** The label of the font size slider. */
  "settings.font-size": [],
  /** The font size as the slider shows it; `percent` is a whole number. */
  "settings.font-size-value": ["percent"],
  /** The name of the group of the colour scheme choice (ADR 0111). */
  "settings.color-scheme": [],
  /** The game's own colour scheme. */
  "settings.color-scheme-default": [],
  /** The colour scheme of green phosphor on dark glass. */
  "settings.color-scheme-retro-crt": [],
  /** The colour scheme after the Solarized palette; the palette's name is not translated. */
  "settings.color-scheme-solarized": [],
  /** The colour scheme with the strongest contrast. */
  "settings.color-scheme-high-contrast": [],
  /** The name of the group of the effects' switches (ADR 0112). */
  "settings.effects": [],
  /** What the effects show on, and that "reduce motion" turns them off. */
  "settings.effects-help": [],
  /** The switch of the glow around the terminal's text. */
  "settings.effects-glow": [],
  /** The switch of the scanlines over the terminal, as on an old monitor. */
  "settings.effects-scanlines": [],
  /** The name of the group of the "reduce motion" choice. */
  "settings.reduce-motion": [],
  /** What "reduce motion" does. */
  "settings.reduce-motion-help": [],
  /** The choice that follows the operating system's "reduce motion" setting. */
  "settings.reduce-motion-system": [],
  /** The choice that reduces motion whatever the system says. */
  "settings.reduce-motion-on": [],
  /** The choice that shows motion whatever the system says. */
  "settings.reduce-motion-off": [],
  /** The name of the group of the volumes (ADR 0113). */
  "settings.sound": [],
  /** The label of the master volume slider, which scales every sound. */
  "settings.volume-master": [],
  /** The label of the music volume slider. */
  "settings.volume-music": [],
  /** The label of the volume slider of the UI sounds. */
  "settings.volume-effects": [],
  /** A volume as its slider shows it; `percent` is a whole number. */
  "settings.volume-value": ["percent"],
  /** The help line of the music volume: there is no music yet. */
  "settings.music-help": [],
  /** The alert when the settings file could not be written. */
  "settings.not-saved": [],
  /** The button that leaves the settings. */
  "settings.back": [],
  /** The accessible name of the list of the settings' categories (ADR 0114). */
  "settings.categories": [],
  /** The category with the language and "reduce motion" (ADR 0114). */
  "settings.category-general": [],
  /** The category with the screen, the colour scheme and the effects (ADR 0114). */
  "settings.category-display": [],
  /** The category with the volumes (ADR 0114). */
  "settings.category-sound": [],
  /** The question before the language changes during a game (ADR 0012). */
  "settings.restart-title": [],
  /** What changing the language during a game does: the tickets restart at their checkpoints. */
  "settings.restart-text": [],
  /** The dialog button that changes the language and restarts the tickets. */
  "settings.restart": [],
  /** The dialog button that keeps the language. */
  "settings.cancel": [],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** A key of a UI text. */
export type UiTextKey = keyof typeof UI_TEXT_PLACEHOLDERS;

/** Whether `key` is the key of a UI text. */
export function isUiTextKey(key: string): key is UiTextKey {
  return Object.hasOwn(UI_TEXT_PLACEHOLDERS, key);
}

/** The key of a command's description for `help NAME` (ADR 0103). */
export type HelpTopicKey = Extract<UiTextKey, `help-topics.${string}`>;

/**
 * The key of the description that `help NAME` shows for the command `name` (ADR 0103), or
 * `undefined` if the UI has none.
 */
export function helpTopicKey(name: string): HelpTopicKey | undefined {
  const key = `help-topics.${name}`;
  return isUiTextKey(key) && isHelpTopicKey(key) ? key : undefined;
}

function isHelpTopicKey(key: UiTextKey): key is HelpTopicKey {
  return key.startsWith("help-topics.");
}

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
