# Story bible

> **Status: skeleton.** Filled in during the story workshop (ROADMAP M4.1). Until then, the
> entries marked "working idea" are not binding. Read this file before writing any
> player-facing text. Reasons: [ADR 0023](decisions/0023-story-and-tone.md).

## Premise

The player starts as an intern in the IT department of a mid-sized company and grows into an
admin by solving tickets. A quiet mystery runs through the chapters.

Working idea for the mystery: the previous admin left suddenly. His notes are scattered across
the servers, and odd things happen in the logs. The player uncovers what happened step by
step, using exactly the skills of each chapter (reading logs, `grep`, `ssh`, checking
permissions). Resolved in chapter 14.

## Tone and humour

- Friendly, relaxed, humorous. Humour comes from real IT life: absurd requests, quirky
  colleagues, ancient hardware, "it worked yesterday".
- The player is never the butt of the joke for making mistakes. Hints are encouraging.
- No time pressure, no threats, no dark themes.
- No real companies, products or people are mocked. Fictional names only.
- German texts address the player with "du"; English texts with "you".
- Keep ticket texts short: the terminal is the main stage.

## Setting (to be decided in the workshop)

| Item | Value |
|---|---|
| Company name and industry | TBD |
| Internal domain | TBD (English, e.g. `<company>.lan`) |
| Host names | TBD (English; the prototype used `itdesk`) |
| In-game OS | Debian 13 (ADR 0004) |
| Calendar | Chapters as training weeks or months; in-game day shown in the top bar |

## Characters (to be decided in the workshop)

| Role | Name | Traits |
|---|---|---|
| Trainer (guides chapter 0) | TBD | |
| Colleagues | TBD | |
| The predecessor | TBD | |
| Ticket senders (office staff, management) | TBD | |

## Running gags (ideas)

- The coffee machine has an IP address and is the most stable server in the building.
- The boss wants to print "the internet" for a meeting.
- A colleague asks whether the cloud must be switched off when it rains.
- "It's always DNS."
- The printer on the second floor.

## Owner's real-life anecdotes

Collected story material from the owner's own IT experience. Add entries whenever the owner
tells one.

- (none yet)

## Ranks (provisional)

| German | English |
|---|---|
| Praktikant | Intern |
| Azubi | Trainee |
| Admin | Admin |
| Senior Admin | Senior Admin |

## Glossary (German ↔ English)

Use these terms consistently in all texts.

| German | English |
|---|---|
| Ticket | ticket |
| Störfall | incident |
| Wiederholungs-Ticket | review ticket |
| Nebenticket | side ticket |
| Posteingang | inbox |
| Kapitel | chapter |
| Hinweis | hint |
| Tipp (bei typischen Fehlern) | tip |
| Extraziel | extra goal |
| Erfolg | achievement |
| Rang, Beförderung | rank, promotion |
| Handbuch | handbook |
| Spielstand, Speicherplatz | save, save slot |
| Freies Spiel | free play |
| Spielwiese | playground |
| Ausbilder | trainer |
| Einstellungen | settings |
