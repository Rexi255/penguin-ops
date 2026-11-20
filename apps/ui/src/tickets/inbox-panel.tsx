// The chapter inbox (ROADMAP M3.5c, ADR 0017, ADR 0099): the tickets of the open chapters in the
// side panel's Tickets tab, chapter by chapter in game order. Each chapter shows its title and how
// many of its tickets are solved; each ticket is a row that opens it, with its kind's icon, its
// title and its state in words. The ticket being played is framed in fibre orange and marked as
// the current one for screen readers.

import type { RichTextInline } from "@penguin-ops/content";
import type { InboxChapter, InboxTicket } from "@penguin-ops/gameplay";
import { type Ref, useId } from "react";

import { Icon } from "../icons/icon";
import { InlineText, Inlines } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";

export interface InboxPanelProps {
  /** The open chapters with the state of every ticket, in game order. */
  readonly chapters: readonly InboxChapter[];
  /** The title of every ticket by its level's ID. */
  readonly titles: ReadonlyMap<string, readonly RichTextInline[]>;
  /** The level of the ticket being played. */
  readonly current: string;
  /** Opens the ticket of the level `levelId`. */
  readonly onOpen: (levelId: string) => void;
  /** The row of the ticket being played, for the game screen to focus. */
  readonly currentRef?: Ref<HTMLButtonElement>;
}

export function InboxPanel({ chapters, titles, current, onOpen, currentRef }: InboxPanelProps) {
  const ui = useTexts();
  const idPrefix = useId();
  const titleId = `${idPrefix}-title`;
  return (
    <section className="inbox" aria-labelledby={titleId}>
      <h2 id={titleId} className="inbox__title">
        <InlineText text={ui.rich("inbox.title")} textKey="inbox.title" />
      </h2>
      {chapters.map((chapter) => {
        const chapterId = `${idPrefix}-${chapter.id}`;
        const solved = chapter.tickets.filter((ticket) => ticket.state === "solved").length;
        return (
          <section key={chapter.id} className="inbox__chapter" aria-labelledby={chapterId}>
            <h3 id={chapterId} className="inbox__chapter-title">
              <Inlines inlines={ui.chapterTitle(chapter.id)} />
            </h3>
            <p className="inbox__progress">
              <InlineText
                text={ui.rich("inbox.progress", { solved, count: chapter.tickets.length })}
                textKey="inbox.progress"
              />
            </p>
            <ul className="inbox__tickets">
              {chapter.tickets.map((ticket) => {
                const isCurrent = ticket.levelId === current;
                return (
                  <li key={ticket.levelId}>
                    <TicketRow
                      ref={isCurrent ? currentRef : undefined}
                      ticket={ticket}
                      title={titleOf(titles, ticket.levelId)}
                      isCurrent={isCurrent}
                      onOpen={onOpen}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

/** The title of the level `levelId`. Throws if `titles` has none. */
export function titleOf(
  titles: ReadonlyMap<string, readonly RichTextInline[]>,
  levelId: string,
): readonly RichTextInline[] {
  const title = titles.get(levelId);
  if (title === undefined) {
    throw new Error(`There is no title of the level "${levelId}".`);
  }
  return title;
}

export interface TicketRowProps {
  readonly ref?: Ref<HTMLButtonElement> | undefined;
  readonly ticket: InboxTicket;
  readonly title: readonly RichTextInline[];
  /** Whether the row is the ticket being played. */
  readonly isCurrent: boolean;
  readonly onOpen: (levelId: string) => void;
}

/**
 * A ticket as a row that opens it: the icon of its kind in its cable colour, its title and its
 * state in words, a solved ticket with the solved icon in the colour of success. The ticket
 * being played is framed in fibre orange; `aria-current` says the same to screen readers.
 */
export function TicketRow({ ref, ticket, title, isCurrent, onOpen }: TicketRowProps) {
  return (
    <button
      ref={ref}
      type="button"
      className="inbox-ticket"
      aria-current={isCurrent ? "true" : undefined}
      onClick={() => {
        onOpen(ticket.levelId);
      }}
    >
      <span className="inbox-ticket__kind">
        <Icon name="ticket" />
      </span>
      <span className="inbox-ticket__title">
        <Inlines inlines={title} />
      </span>{" "}
      <TicketStateText state={ticket.state} />
    </button>
  );
}

/** The state of a ticket in words, a solved one with its icon. */
function TicketStateText({ state }: { readonly state: InboxTicket["state"] }) {
  const ui = useTexts();
  switch (state) {
    case "new":
      return (
        <span className="inbox-ticket__state">
          <InlineText text={ui.rich("inbox.new")} textKey="inbox.new" />
        </span>
      );
    case "started":
      return (
        <span className="inbox-ticket__state">
          <InlineText text={ui.rich("inbox.started")} textKey="inbox.started" />
        </span>
      );
    case "solved":
      return (
        <span className="inbox-ticket__state inbox-ticket__state--solved">
          <Icon name="solved" />
          <InlineText text={ui.rich("ticket.solved")} textKey="ticket.solved" />
        </span>
      );
  }
}
