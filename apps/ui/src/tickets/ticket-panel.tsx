// The ticket panel (ROADMAP M3.5a, ADR 0097): the ticket being played in the side panel's
// Tickets tab. It shows the ticket's title, where the player is (the steps as tape segments, or
// that the ticket is solved), the ticket's text, and below it the messages the game said about
// the ticket: completed steps and tips, oldest first, like comments in a real ticket. Changes of
// the state and new messages are announced politely.

import { useEffect, useId, useRef } from "react";

import { Icon } from "../icons/icon";
import { InlineText, Inlines } from "../texts/inline-text";
import { RichTextBlocks } from "../texts/rich-text";
import { useTexts } from "../texts/texts-context";
import { stepPosition, type TicketMessage, type TicketProgress } from "./ticket-progress";
import { messageText, type TicketTexts } from "./ticket-texts";

export interface TicketPanelProps {
  readonly texts: TicketTexts;
  /** How many steps the ticket has; 0 for a ticket with a single goal. */
  readonly stepCount: number;
  readonly progress: TicketProgress;
}

export function TicketPanel({ texts, stepCount, progress }: TicketPanelProps) {
  const ui = useTexts();
  const idPrefix = useId();
  const titleId = `${idPrefix}-title`;
  const messagesId = `${idPrefix}-messages`;
  const lastMessage = useRef<HTMLLIElement>(null);
  const messageCount = progress.messages.length;

  // A new message comes into view, so the player sees it below a long ticket text.
  useEffect(() => {
    if (messageCount > 0) {
      lastMessage.current?.scrollIntoView({ block: "nearest" });
    }
  }, [messageCount]);

  return (
    <article className="ticket" aria-labelledby={titleId}>
      <h2 id={titleId} className="ticket__title">
        <Inlines inlines={texts.title} />
      </h2>
      {/* Always present, so that a change of the state is announced. */}
      <div className="ticket__state" role="status">
        <TicketState stepCount={stepCount} progress={progress} />
      </div>
      <div className="ticket__text">
        <RichTextBlocks text={texts.ticket} />
      </div>
      {/* Always present, so that a new message is announced. */}
      <div aria-live="polite">
        {messageCount > 0 && (
          <section className="ticket__updates" aria-labelledby={messagesId}>
            <h3 id={messagesId} className="ticket__updates-title">
              <InlineText text={ui.rich("ticket.updates")} textKey="ticket.updates" />
            </h3>
            <ol className="ticket__messages">
              {progress.messages.map((message, index) => (
                // Messages are only ever added at the end, so the index is a stable key.
                <li
                  key={index}
                  ref={index === messageCount - 1 ? lastMessage : undefined}
                  className={`ticket__message ticket__message--${message.kind}`}
                >
                  <MessageContent texts={texts} message={message} />
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </article>
  );
}

/** Where the player is: the steps as tape segments with their text, and the solved ticket. */
function TicketState({ stepCount, progress }: Omit<TicketPanelProps, "texts">) {
  const ui = useTexts();
  const position = stepPosition(progress, stepCount);
  return (
    <>
      {stepCount > 0 && <StepSegments stepCount={stepCount} progress={progress} />}
      {position !== undefined && (
        <span className="ticket__step">
          <InlineText
            text={ui.rich("ticket.step", { current: position.current, count: position.count })}
            textKey="ticket.step"
          />
        </span>
      )}
      {progress.solved && (
        <span className="ticket__solved">
          <Icon name="solved" />
          <InlineText text={ui.rich("ticket.solved")} textKey="ticket.solved" />
        </span>
      )}
    </>
  );
}

/**
 * One tape segment per step (DESIGN.md: progress is drawn as segments whose number is the exact
 * count): completed steps are printed tape, the current step is framed in fibre orange, the
 * steps after it are outlined. The text next to them says the same, so they are hidden from
 * screen readers.
 */
function StepSegments({ stepCount, progress }: Omit<TicketPanelProps, "texts">) {
  const segments = Array.from({ length: stepCount }, (_, index) => {
    if (index < progress.completedSteps) {
      return "done";
    }
    return index === progress.completedSteps && !progress.solved ? "current" : "open";
  });
  return (
    <span className="ticket__segments" aria-hidden="true">
      {segments.map((state, index) => (
        <span key={index} className={`ticket__segment ticket__segment--${state}`} />
      ))}
    </span>
  );
}

/** A message with its icon and a label for screen readers that says what kind it is. */
function MessageContent({
  texts,
  message,
}: {
  readonly texts: TicketTexts;
  readonly message: TicketMessage;
}) {
  const ui = useTexts();
  const label = message.kind === "step" ? "ticket.step-done" : "ticket.tip";
  return (
    <>
      <Icon name={message.kind === "step" ? "solved" : "hint"} />
      <span className="visually-hidden">
        <InlineText text={ui.rich(label)} textKey={label} />
      </span>
      <div className="ticket__message-text">
        <RichTextBlocks text={messageText(texts, message.say)} />
      </div>
    </>
  );
}
