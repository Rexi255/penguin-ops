// The text of a game command in the terminal (ROADMAP M3.6b, ADR 0103): the game speaks in its
// own face with an icon, like a game notice, never in the shell's. `help` shows the game's
// overview with the commands the game simulates, `help NAME` a command's description or that
// the game does not know it, and `hint` the ticket's next hint with its number, or that every
// hint is shown.

import type { RichText } from "@penguin-ops/content";
import { COMMAND_NAMES } from "@penguin-ops/gameplay";

import { Icon, type IconName } from "../icons/icon";
import { InlineText } from "../texts/inline-text";
import { RichTextBlocks } from "../texts/rich-text";
import { useTexts } from "../texts/texts-context";
import { helpTopicKey, type Texts } from "../texts/ui-texts";
import { HINT_COUNT } from "../tickets/ticket-progress";
import type { TicketTexts } from "../tickets/ticket-texts";
import type { GameMessage } from "./terminal-model";

/** The ticket's three hints. */
export type TicketHints = TicketTexts["hints"];

export interface GameLineProps {
  readonly message: GameMessage;
  /** The hints of the ticket the terminal plays. */
  readonly hints: TicketHints;
}

export function GameLine({ message, hints }: GameLineProps) {
  const texts = useTexts();
  return (
    <div className="terminal__notice terminal__game">
      <Icon name={ICONS[message.kind]} />
      <div className="terminal__game-text">
        <GameText message={message} hints={hints} texts={texts} />
      </div>
    </div>
  );
}

/** The icon of each message: the handbook for `help`, the hint's for `hint`. */
const ICONS: Readonly<Record<GameMessage["kind"], IconName>> = {
  help: "handbook",
  "help-topic": "handbook",
  "help-unknown": "handbook",
  hint: "hint",
  "no-more-hints": "hint",
};

function GameText({ message, hints, texts }: GameLineProps & { readonly texts: Texts }) {
  switch (message.kind) {
    case "help":
      return (
        <>
          <RichTextBlocks text={texts.rich("help.overview")} />
          <p>
            <InlineText text={texts.rich("help.commands")} textKey="help.commands" />
          </p>
          <ul className="terminal__commands">
            {COMMAND_NAMES.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </>
      );
    case "help-topic":
      return <RichTextBlocks text={helpTopic(texts, message.topic)} />;
    case "help-unknown":
      return (
        <RichTextBlocks text={texts.rich("help.unknown", { topic: { code: message.topic } })} />
      );
    case "hint":
      return (
        <>
          <p className="terminal__game-label">
            <InlineText
              text={texts.rich("ticket.hint", { number: message.number, count: HINT_COUNT })}
              textKey="ticket.hint"
            />
          </p>
          <RichTextBlocks text={hintText(hints, message.number)} />
        </>
      );
    case "no-more-hints":
      return <RichTextBlocks text={texts.rich("terminal.no-more-hints")} />;
  }
}

/**
 * The description of the command `name`. Throws if the UI has none; a test makes sure that every
 * command the game simulates has one.
 */
function helpTopic(texts: Texts, name: string): RichText {
  const key = helpTopicKey(name);
  if (key === undefined) {
    throw new Error(`The UI has no help text for the command "${name}".`);
  }
  return texts.rich(key);
}

/** The hint with the number `number`, counted from 1. */
function hintText(hints: TicketHints, number: number): RichText {
  const hint = hints[number - 1];
  if (hint === undefined) {
    throw new RangeError(`A ticket has no hint ${String(number)}.`);
  }
  return hint;
}
