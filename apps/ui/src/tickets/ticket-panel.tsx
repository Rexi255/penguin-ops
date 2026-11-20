// The ticket panel (ROADMAP M3.5a, ADR 0097): the ticket being played in the side panel's
// Tickets tab. It shows the ticket's title, where the player is (the steps as tape segments, or
// that the ticket is solved), the ticket's text, and below it the messages the game said about
// the ticket: completed steps and tips, oldest first, like comments in a real ticket. Changes of
// the state and new messages are announced politely.
//
// Above the messages it shows the hints the player asked for with F1, one more each time, and
// after the ticket is solved, below the messages, the explanation of what the player learned
// (M3.5b, ADR 0098). A new hint is announced politely; the explanation comes into view.
//
// Below the ticket's text it lists the ticket's extra goals with their bonus XP and whether the
// player has reached them (M3.5d, ADR 0100). A reached extra goal also becomes a message, so that
// it is announced.

import type { ExtraGoal } from "@penguin-ops/content";
import { type Ref, useEffect, useId, useRef } from "react";

import { Icon } from "../icons/icon";
import { InlineText, Inlines } from "../texts/inline-text";
import { RichTextBlocks } from "../texts/rich-text";
import { useTexts } from "../texts/texts-context";
import {
  HINT_COUNT,
  stepPosition,
  type TicketMessage,
  type TicketProgress,
} from "./ticket-progress";
import {
  type ExplanationTexts,
  extraGoalText,
  messageText,
  type TicketTexts,
} from "./ticket-texts";

export interface TicketPanelProps {
  readonly texts: TicketTexts;
  /** How many steps the ticket has; 0 for a ticket with a single goal. */
  readonly stepCount: number;
  /** The ticket's extra goals in the level's order; possibly none. */
  readonly extraGoals: readonly ExtraGoal[];
  readonly progress: TicketProgress;
}

export function TicketPanel({ texts, stepCount, extraGoals, progress }: TicketPanelProps) {
  const ui = useTexts();
  const idPrefix = useId();
  const titleId = `${idPrefix}-title`;
  const hintsId = `${idPrefix}-hints`;
  const messagesId = `${idPrefix}-messages`;
  const lastHint = useRef<HTMLLIElement>(null);
  const lastMessage = useRef<HTMLLIElement>(null);
  const explanation = useRef<HTMLElement>(null);
  const messageCount = progress.messages.length;
  const { hintsShown, solved } = progress;
  const hints = texts.hints.slice(0, hintsShown);

  // A new hint comes into view, so the player sees it below a long ticket text.
  useEffect(() => {
    if (hintsShown > 0) {
      lastHint.current?.scrollIntoView({ block: "nearest" });
    }
  }, [hintsShown]);

  // A new message comes into view, so the player sees it below a long ticket text.
  useEffect(() => {
    if (messageCount > 0) {
      lastMessage.current?.scrollIntoView({ block: "nearest" });
    }
  }, [messageCount]);

  // The explanation comes into view from its heading when the ticket is solved. This runs after
  // the message effect, so a step message of the same input does not scroll it away.
  useEffect(() => {
    if (solved) {
      explanation.current?.scrollIntoView({ block: "start" });
    }
  }, [solved]);

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
      {extraGoals.length > 0 && (
        <ExtraGoals texts={texts} extraGoals={extraGoals} reached={progress.reachedExtraGoals} />
      )}
      {/* Always present, so that a new hint is announced. */}
      <div className="ticket__live" aria-live="polite">
        {hints.length > 0 && (
          <section className="ticket__section" aria-labelledby={hintsId}>
            <h3 id={hintsId} className="ticket__section-title">
              <InlineText text={ui.rich("ticket.hints")} textKey="ticket.hints" />
            </h3>
            <ol className="ticket__messages">
              {hints.map((hint, index) => (
                // Hints are only ever added at the end, so the index is a stable key.
                <li
                  key={index}
                  ref={index === hints.length - 1 ? lastHint : undefined}
                  className="ticket__message ticket__message--hint"
                >
                  <Icon name="hint" />
                  <div className="ticket__message-text">
                    <p className="ticket__hint-label">
                      <InlineText
                        text={ui.rich("ticket.hint", { number: index + 1, count: HINT_COUNT })}
                        textKey="ticket.hint"
                      />
                    </p>
                    <RichTextBlocks text={hint} />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      {/* Always present, so that a new message is announced. */}
      <div className="ticket__live" aria-live="polite">
        {messageCount > 0 && (
          <section className="ticket__section" aria-labelledby={messagesId}>
            <h3 id={messagesId} className="ticket__section-title">
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
      {solved && <Explanation ref={explanation} explanation={texts.explanation} />}
    </article>
  );
}

/**
 * What the player learned: the explanation's text, the variants of the taught command with what
 * they do, and a command to try. The commands are literal and the same in every language.
 */
function Explanation({
  ref,
  explanation,
}: {
  readonly ref: Ref<HTMLElement>;
  readonly explanation: ExplanationTexts;
}) {
  const ui = useTexts();
  const idPrefix = useId();
  const titleId = `${idPrefix}-explanation`;
  const optionsId = `${idPrefix}-options`;
  const { text, options, example } = explanation;
  return (
    <section ref={ref} className="ticket__section ticket__explanation" aria-labelledby={titleId}>
      <h3 id={titleId} className="ticket__section-title">
        <InlineText text={ui.rich("ticket.explanation")} textKey="ticket.explanation" />
      </h3>
      <div className="ticket__text">
        <RichTextBlocks text={text} />
      </div>
      {options.length > 0 && (
        <>
          <h4 id={optionsId} className="ticket__section-title ticket__options-title">
            <InlineText text={ui.rich("ticket.options")} textKey="ticket.options" />
          </h4>
          <dl className="ticket__options" aria-labelledby={optionsId}>
            {options.map(({ option, description }) => (
              <div key={option} className="ticket__option">
                <dt>
                  <code>{option}</code>
                </dt>
                <dd className="ticket__message-text">
                  <RichTextBlocks text={description} />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {example !== undefined && (
        <p className="ticket__example">
          <InlineText text={ui.rich("ticket.example")} textKey="ticket.example" />{" "}
          <code>{example}</code>
        </p>
      )}
    </section>
  );
}

/**
 * The ticket's optional extra goals, each with its description, its bonus XP and its state in
 * words: open, or reached with the icon of success. Reaching one is announced by its message, not
 * here, so this list is not a live region.
 */
function ExtraGoals({
  texts,
  extraGoals,
  reached,
}: {
  readonly texts: TicketTexts;
  readonly extraGoals: readonly ExtraGoal[];
  readonly reached: readonly string[];
}) {
  const ui = useTexts();
  const titleId = `${useId()}-extra-goals`;
  return (
    <section className="ticket__section" aria-labelledby={titleId}>
      <h3 id={titleId} className="ticket__section-title">
        <InlineText text={ui.rich("ticket.extra-goals")} textKey="ticket.extra-goals" />
      </h3>
      <ul className="ticket__goals">
        {extraGoals.map(({ id, xp }) => {
          const isReached = reached.includes(id);
          const state = isReached ? "ticket.extra-goal-reached" : "ticket.extra-goal-open";
          return (
            <li
              key={id}
              className={`ticket__goal${isReached ? " ticket__goal--reached" : ""}`}
              data-extra-goal={id}
            >
              <div className="ticket__message-text">
                <RichTextBlocks text={extraGoalText(texts, id)} />
              </div>
              <p className="ticket__goal-meta">
                <span>
                  <InlineText text={ui.rich("ticket.xp", { xp })} textKey="ticket.xp" />
                </span>
                <span className="ticket__goal-state">
                  {isReached && <Icon name="solved" />}
                  <InlineText text={ui.rich(state)} textKey={state} />
                </span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Where the player is: the steps as tape segments with their text, and the solved ticket. */
function TicketState({ stepCount, progress }: Pick<TicketPanelProps, "stepCount" | "progress">) {
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
function StepSegments({ stepCount, progress }: Pick<TicketPanelProps, "stepCount" | "progress">) {
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

/**
 * A message with its icon and a label that says what kind it is: for screen readers before the
 * text of a step or a tip, and visible above the description of a reached extra goal with its
 * bonus XP, because the description alone reads like a task.
 */
function MessageContent({
  texts,
  message,
}: {
  readonly texts: TicketTexts;
  readonly message: TicketMessage;
}) {
  const ui = useTexts();
  switch (message.kind) {
    case "extra-goal":
      return (
        <>
          <Icon name="solved" />
          <div className="ticket__message-text">
            <p className="ticket__message-label">
              <span>
                <InlineText
                  text={ui.rich("ticket.extra-goal-done")}
                  textKey="ticket.extra-goal-done"
                />
              </span>
              <span>
                <InlineText text={ui.rich("ticket.xp", { xp: message.xp })} textKey="ticket.xp" />
              </span>
            </p>
            <RichTextBlocks text={extraGoalText(texts, message.id)} />
          </div>
        </>
      );
    case "step":
    case "tip": {
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
  }
}
