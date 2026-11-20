// The game screen (ROADMAP M3.1c): the frame of the workplace layout of ADR 0020 with a top bar,
// the side panel, the terminal and the key-hint footer, and the pause menu that Esc opens
// (ADR 0092). The terminal (M3.3, ADR 0095) plays the level it gets and has the focus. The side
// panel holds the tabs of the tickets, the mail and the handbook (M3.4, ADR 0096); the tickets
// panel shows the ticket being played (M3.5a, ADR 0097) or the chapter inbox (M3.5c, ADR 0099),
// M3.11 fills the others. The footer shows the key hints of the keys that work. The top bar names
// where the player is: the chapter, the ticket and its step or state; the rank and progress
// follow with M3.12.
//
// The game screen keeps the game: the tickets the player opened with their progress and their
// terminals. The terminal reports the game events of every input, and the ticket panel and the top
// bar show what they add up to. The inbox opens any ticket of an open chapter; a ticket the player
// left goes on where they left it. After solving, the ticket offers the next one. F1 or its key
// hint shows the ticket's next hint and brings the ticket to the front (M3.5b, ADR 0098); the
// focus stays where it is, so the player keeps typing. Until the save system (M3.7), the game
// starts again whenever the screen appears.

import type { Content, ExtraGoal, RichTextInline } from "@penguin-ops/content";
import { createGameClock } from "@penguin-ops/engine";
import {
  chapterOf,
  GAME_START_TIME,
  type GameEvent,
  type GameMode,
  inbox,
  isTicketOpen,
  levelSetup,
  type LevelSetup,
  nextTicket,
  startLevel,
  ticketState,
} from "@penguin-ops/gameplay";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../icons/icon";
import { Terminal } from "../terminal/terminal";
import { createTerminal, type TerminalState } from "../terminal/terminal-model";
import { InlineText, Inlines } from "../texts/inline-text";
import { useTexts } from "../texts/texts-context";
import { InboxPanel, titleOf } from "../tickets/inbox-panel";
import { NextTicket, type NextTicketOffer } from "../tickets/next-ticket";
import { TicketPanel } from "../tickets/ticket-panel";
import {
  applyGameEvents,
  showNextHint,
  stepPosition,
  TICKET_START,
  type TicketProgress,
} from "../tickets/ticket-progress";
import { type TicketTexts, ticketTexts } from "../tickets/ticket-texts";
import { PauseMenu } from "./pause-menu";
import { SidePanel, type SidePanelTab } from "./side-panel";

export interface GameScreenProps {
  /** The loaded content: the chapters and levels the game offers. */
  readonly content: Content;
  /** The game's mode, which decides which chapters are open (ADR 0017). */
  readonly mode: GameMode;
  /** The player's Linux user name. */
  readonly userName: string;
  /** The level the game starts with; it must be in an open chapter of a new game. */
  readonly firstTicket: string;
  /** Leaves the game for the start screen. */
  readonly onMainMenu: () => void;
}

/** The extra goals of a level without any, one value so that the ticket panel keeps its props. */
const NO_EXTRA_GOALS: readonly ExtraGoal[] = [];

/** What the Tickets tab shows: the ticket being played, or the chapter inbox. */
export type TicketsView = "ticket" | "inbox";

/** The ticket being played and the terminal it starts with. */
interface OpenedTicket {
  readonly levelId: string;
  readonly terminal: TerminalState;
}

/** A terminal for `level`, started at the game's start time. */
function startTerminal(level: LevelSetup): TerminalState {
  const clock = createGameClock(GAME_START_TIME);
  const session = startLevel(level, clock);
  return createTerminal(session, clock.now());
}

/** The keys of the tickets in `progress` that match `test`. */
function levelsWhere(
  progress: ReadonlyMap<string, TicketProgress>,
  test: (ticket: TicketProgress) => boolean,
): ReadonlySet<string> {
  return new Set([...progress].filter(([, ticket]) => test(ticket)).map(([levelId]) => levelId));
}

export function GameScreen({ content, mode, userName, firstTicket, onMainMenu }: GameScreenProps) {
  const texts = useTexts();
  const { language } = texts;
  const { chapters } = content;
  const [paused, setPaused] = useState(false);
  // The texts of every ticket in the player's language.
  const tickets = useMemo(
    () =>
      new Map(
        [...content.levels.keys()].map((levelId) => [
          levelId,
          ticketTexts(content, levelId, language),
        ]),
      ),
    [content, language],
  );
  const titles = useMemo(
    () => new Map([...tickets].map(([levelId, ticket]) => [levelId, ticket.title])),
    [tickets],
  );
  const newTerminal = useCallback(
    (levelId: string) => startTerminal(levelSetup(content, levelId, language, userName)),
    [content, language, userName],
  );
  // The game starts once, when the screen appears, with the first ticket open.
  const [opened, setOpened] = useState<OpenedTicket>(() => {
    if (!isTicketOpen(chapters, mode, new Set(), firstTicket)) {
      throw new Error(`The level "${firstTicket}" is not open in a new ${mode} game.`);
    }
    return { levelId: firstTicket, terminal: newTerminal(firstTicket) };
  });
  // The latest terminal of every ticket the player opened, to go on there when they come back.
  const terminals = useRef(new Map<string, TerminalState>());
  // The progress of every ticket the player opened; the opened ones are the started ones.
  const [progress, setProgress] = useState<ReadonlyMap<string, TicketProgress>>(
    () => new Map([[firstTicket, TICKET_START]]),
  );
  const [tab, setTab] = useState<SidePanelTab>("tickets");
  const [ticketsView, setTicketsView] = useState<TicketsView>("ticket");
  const terminalInput = useRef<HTMLTextAreaElement>(null);
  const currentRow = useRef<HTMLButtonElement>(null);
  const ticketsTop = useRef<HTMLDivElement>(null);
  const menuHint = useRef<HTMLButtonElement>(null);
  // Where the focus goes after the next render: the terminal of a ticket the player opened, or
  // the current ticket's row when they went back to the inbox.
  const pendingFocus = useRef<"terminal" | "current-row" | undefined>(undefined);
  // The element that had the focus when the pause menu opened; it gets the focus back.
  const focusBeforePause = useRef<HTMLElement | null>(null);

  const levelId = opened.levelId;
  const ticketProgress = progress.get(levelId) ?? TICKET_START;
  const level = content.levels.get(levelId);
  const stepCount = level?.steps?.length ?? 0;
  const extraGoals = level?.extraGoals ?? NO_EXTRA_GOALS;
  const started = useMemo(() => new Set(progress.keys()), [progress]);
  const solved = useMemo(() => levelsWhere(progress, (entry) => entry.solved), [progress]);

  const openPauseMenu = useCallback(() => {
    const active = document.activeElement;
    focusBeforePause.current = active instanceof HTMLElement ? active : null;
    setPaused(true);
  }, []);

  const closePauseMenu = useCallback(() => {
    setPaused(false);
  }, []);

  const onGameEvents = useCallback(
    (events: readonly GameEvent[]) => {
      setProgress((current) =>
        new Map(current).set(
          levelId,
          applyGameEvents(current.get(levelId) ?? TICKET_START, events),
        ),
      );
    },
    [levelId],
  );

  const onTerminalChange = useCallback(
    (state: TerminalState) => {
      terminals.current.set(levelId, state);
    },
    [levelId],
  );

  // Opening a ticket shows it, goes on in its terminal where the player left it, or starts it,
  // and gives its terminal the focus.
  const openTicket = useCallback(
    (id: string) => {
      if (id !== levelId) {
        if (!terminals.current.has(levelId)) {
          terminals.current.set(levelId, opened.terminal);
        }
        setOpened({ levelId: id, terminal: terminals.current.get(id) ?? newTerminal(id) });
        setProgress((current) =>
          current.has(id) ? current : new Map(current).set(id, TICKET_START),
        );
      }
      setTicketsView("ticket");
      pendingFocus.current = "terminal";
    },
    [levelId, opened.terminal, newTerminal],
  );

  const showInbox = useCallback(() => {
    setTicketsView("inbox");
    pendingFocus.current = "current-row";
  }, []);

  // The hint appears with the ticket in the tickets panel, so that panel comes to the front.
  const showHint = useCallback(() => {
    setProgress((current) =>
      new Map(current).set(levelId, showNextHint(current.get(levelId) ?? TICKET_START)),
    );
    setTab("tickets");
    setTicketsView("ticket");
  }, [levelId]);

  // A ticket or the inbox starts at the top of the panel; the ticket panel's own effects scroll
  // to a hint or the explanation after this.
  useLayoutEffect(() => {
    ticketsTop.current?.scrollIntoView({ block: "start" });
  }, [ticketsView, levelId]);

  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = undefined;
    switch (target) {
      case "terminal":
        terminalInput.current?.focus();
        break;
      case "current-row":
        currentRow.current?.focus();
        break;
      case undefined:
        break;
    }
  });

  const ticket = tickets.get(levelId);
  if (ticket === undefined) {
    throw new Error(`The content has no level "${levelId}".`);
  }
  const chapterTitle = texts.chapterTitle(chapterOf(chapters, levelId).id);
  const next = ticketProgress.solved
    ? nextTicketOffer(content, mode, solved, started, levelId, titles, texts.chapterTitle)
    : undefined;
  const ticketsPanel = (
    <div ref={ticketsTop} className="tickets-tab">
      {ticketsView === "inbox" ? (
        <InboxPanel
          chapters={inbox(chapters, mode, { started, solved })}
          titles={titles}
          current={levelId}
          onOpen={openTicket}
          currentRef={currentRow}
        />
      ) : (
        <>
          <button type="button" className="back-button" onClick={showInbox}>
            <Icon name="ticket" />
            <InlineText text={texts.rich("inbox.back")} textKey="inbox.back" />
          </button>
          <TicketPanel
            key={levelId}
            texts={ticket}
            stepCount={stepCount}
            extraGoals={extraGoals}
            progress={ticketProgress}
          />
          {ticketProgress.solved && <NextTicket next={next} onOpen={openTicket} />}
        </>
      )}
    </div>
  );

  // The keyboard is the main input (PRODUCT.md): when the screen appears, the terminal's input
  // line has the focus, and whenever the pause menu closes, the focus goes back to where it was.
  // The frame is inert while the menu is open, so this waits until it is not.
  useEffect(() => {
    if (paused) {
      return;
    }
    const target = focusBeforePause.current;
    focusBeforePause.current = null;
    if (target !== null && target !== document.body && target.isConnected) {
      target.focus();
    } else {
      terminalInput.current?.focus();
    }
  }, [paused]);

  // In the game, Esc opens the pause menu and F1 shows the next hint (ADR 0020); while the menu
  // is open, it handles Esc and the game takes no keys. A held key acts once.
  useEffect(() => {
    if (paused) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        openPauseMenu();
      } else if (event.key === "F1") {
        event.preventDefault();
        showHint();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [paused, openPauseMenu, showHint]);

  return (
    <div className="game-screen">
      {/* While the pause menu is open, the frame takes neither focus nor clicks. */}
      <div className="game-screen__frame" inert={paused}>
        <header className="game-screen__top-bar">
          <h1 className="visually-hidden">
            <InlineText text={texts.rich("game.title")} textKey="game.title" />
          </h1>
          <GuideWords
            chapterTitle={chapterTitle}
            ticket={ticket}
            stepCount={stepCount}
            progress={ticketProgress}
          />
        </header>
        <aside className="game-screen__side-panel" aria-label={texts.plain("game.side-panel")}>
          <SidePanel tickets={ticketsPanel} selected={tab} onSelect={setTab} />
        </aside>
        <main className="game-screen__terminal" aria-label={texts.plain("game.terminal")}>
          {/* Each ticket has a terminal of its own, which starts where the player left it. */}
          <Terminal
            key={levelId}
            ref={terminalInput}
            initialState={opened.terminal}
            onGameEvents={onGameEvents}
            onStateChange={onTerminalChange}
          />
        </main>
        <footer className="game-screen__footer">
          <button type="button" className="key-hint" aria-keyshortcuts="F1" onClick={showHint}>
            <kbd className="key-hint__key">
              <InlineText text={texts.rich("keys.f1")} textKey="keys.f1" />
            </kbd>{" "}
            <InlineText text={texts.rich("game.hint")} textKey="game.hint" />
          </button>
          {/* The terminal answers Tab itself, so its hint is no button (ADR 0096). */}
          <span className="key-hint key-hint--terminal">
            <kbd className="key-hint__key">
              <InlineText text={texts.rich("keys.tab")} textKey="keys.tab" />
            </kbd>{" "}
            <InlineText text={texts.rich("game.complete")} textKey="game.complete" />
          </span>
          <button
            ref={menuHint}
            type="button"
            className="key-hint"
            aria-keyshortcuts="Escape"
            onClick={() => {
              openPauseMenu();
            }}
          >
            <kbd className="key-hint__key">
              <InlineText text={texts.rich("keys.escape")} textKey="keys.escape" />
            </kbd>{" "}
            <InlineText text={texts.rich("game.menu")} textKey="game.menu" />
          </button>
        </footer>
      </div>
      {paused && <PauseMenu onContinue={closePauseMenu} onMainMenu={onMainMenu} />}
    </div>
  );
}

/**
 * The ticket the game offers after the solved level `levelId` (ADR 0099), with the title of the
 * chapter that solving it opened, or `undefined` when every open ticket is solved.
 */
function nextTicketOffer(
  content: Content,
  mode: GameMode,
  solved: ReadonlySet<string>,
  started: ReadonlySet<string>,
  levelId: string,
  titles: ReadonlyMap<string, readonly RichTextInline[]>,
  chapterTitle: (chapterId: string) => readonly RichTextInline[],
): NextTicketOffer | undefined {
  const { chapters } = content;
  const next = nextTicket(chapters, mode, solved, levelId);
  if (next === undefined) {
    return undefined;
  }
  const solvedBefore = new Set(solved);
  solvedBefore.delete(levelId);
  const offer = {
    ticket: { levelId: next, state: ticketState({ started, solved }, next) },
    title: titleOf(titles, next),
  };
  return isTicketOpen(chapters, mode, solvedBefore, next)
    ? offer
    : { ...offer, openedChapter: chapterTitle(chapterOf(chapters, next).id) };
}

/**
 * The top bar's guide words (DESIGN.md): the chapter's title, the ticket's title and the step the
 * player works on, or that the ticket is solved. The ticket panel announces changes, so these are
 * not live.
 */
function GuideWords({
  chapterTitle,
  ticket,
  stepCount,
  progress,
}: {
  readonly chapterTitle: readonly RichTextInline[];
  readonly ticket: TicketTexts;
  readonly stepCount: number;
  readonly progress: TicketProgress;
}) {
  const texts = useTexts();
  const position = stepPosition(progress, stepCount);
  return (
    <p className="guide-words">
      <span className="guide-words__chapter">
        <Inlines inlines={chapterTitle} />
      </span>
      <span className="guide-words__ticket">
        <Inlines inlines={ticket.title} />
      </span>
      {position !== undefined && (
        <span className="guide-words__state">
          <InlineText
            text={texts.rich("ticket.step", { current: position.current, count: position.count })}
            textKey="ticket.step"
          />
        </span>
      )}
      {progress.solved && (
        <span className="guide-words__state guide-words__state--solved">
          <Icon name="solved" />
          <InlineText text={texts.rich("ticket.solved")} textKey="ticket.solved" />
        </span>
      )}
    </p>
  );
}
