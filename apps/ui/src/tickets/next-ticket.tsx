// What follows a solved ticket (ROADMAP M3.5c, ADR 0099): below the explanation, the ticket the
// game offers next as a row that opens it, and before it the title of a chapter that solving the
// ticket opened. When every ticket of the open chapters is solved, a sentence says so instead.

import type { RichTextInline } from "@penguin-ops/content";
import type { InboxTicket } from "@penguin-ops/gameplay";
import { useId } from "react";

import { InlineText, Inlines } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import { TicketRow } from "./inbox-panel";

/** The ticket offered next, with its title and the chapter it opened, if any. */
export interface NextTicketOffer {
  readonly ticket: InboxTicket;
  readonly title: readonly RichTextInline[];
  /** The title of the chapter that solving the ticket opened, which holds the next ticket. */
  readonly openedChapter?: readonly RichTextInline[];
}

export interface NextTicketProps {
  /** The next ticket, or `undefined` when every ticket of the open chapters is solved. */
  readonly next: NextTicketOffer | undefined;
  readonly onOpen: (levelId: string) => void;
}

export function NextTicket({ next, onOpen }: NextTicketProps) {
  const ui = useTexts();
  const titleId = `${useId()}-next`;
  return (
    <section className="ticket__section next-ticket" aria-labelledby={titleId}>
      <h3 id={titleId} className="ticket__section-title">
        <InlineText text={ui.rich("inbox.next")} textKey="inbox.next" />
      </h3>
      {next === undefined ? (
        <p className="next-ticket__text">
          <InlineText text={ui.rich("inbox.all-solved")} textKey="inbox.all-solved" />
        </p>
      ) : (
        <>
          {next.openedChapter !== undefined && (
            <p className="next-ticket__text">
              <InlineText text={ui.rich("inbox.chapter-open")} textKey="inbox.chapter-open" />{" "}
              <strong>
                <Inlines inlines={next.openedChapter} />
              </strong>
            </p>
          )}
          <TicketRow ticket={next.ticket} title={next.title} isCurrent={false} onOpen={onOpen} />
        </>
      )}
    </section>
  );
}
