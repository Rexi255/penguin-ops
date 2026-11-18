# 0079. Developer mode API on top of the level session

- Status: Accepted
- Date: 2026-11-18
- Supersedes: –

## Context

ADR 0015 plans a hidden developer mode for reviews and screenshot tests: jump to any level or
step, auto-play reference solutions, show the check rules live. ROADMAP M2.7 asks for its API
in `packages/gameplay`; the UI follows in M3.16. The level session (ADR 0077) already starts a
level, resumes at a checkpoint and evaluates the rules after every input, and the content test
(ADR 0078) already builds a level's setup from the loaded content for every language.

## Decision

`packages/gameplay/src/developer-mode.ts` adds four pure functions on top of the level session
and no state of its own:

- **`levelSetup(content, levelId, language, player)`** builds what `startLevel` needs: the
  level, its base world and the prose file texts in the language, with the English fallback of
  ADR 0074 (also for a language without any catalog). The content test uses it too, so the
  developer mode and the tests build levels the same way.
- **`startAtStep(setup, clock, step?)`** starts a level so that `step` is the step to play
  next: the first step (or none) starts from the beginning, every later step resumes at the
  checkpoint of the step before it, with the replay of the first reference solution of
  ADR 0077.
- **`autoPlay(session, solution, options)`** submits every command line of the reference
  solution number `solution` (counted from 1, as the content test reports it) with `runInput`,
  also after the ticket is solved, and returns each line with its result. The lines run on the
  session as it is: after a jump to a later step, the commands of the earlier steps run again
  and their errors are part of the result.
- **`inspectRules(session, output)`** returns the state of every rule of the level: the goal or
  each step (`completed`, `current` or `waiting`), each tip with whether it was shown, each
  extra goal with whether it was reached, and for `all`, `any` and `not` the state of every
  rule inside. The caller passes the output of the last input, because the session does not
  keep it.

An unknown level, step or solution number throws a `DeveloperModeError`. Switching the language
during a ticket (also named in ADR 0015) is a matter of the UI texts and comes with M3.16.

## Alternatives considered

- **A stateful developer-mode object that wraps a session:** it would duplicate the immutable
  session of ADR 0077 and need its own tests for every state change; plain functions over the
  session compose with whatever the UI keeps.
- **`autoPlay` that skips the lines of steps already completed:** a reference solution does
  not say which lines belong to which step, so skipping would be a guess; running all lines
  shows exactly what the commands do.
- **`autoPlay` that stops when the ticket is solved:** extra goals reached by later lines would
  never be shown, and the developer mode is for seeing what the solution does.
- **Keeping the last output in the session for `inspectRules`:** it would change the session
  that save games and the game loop use, only for the developer mode.

## Consequences

- The developer mode UI (M3.16) needs no game logic of its own: it calls these functions and
  shows their results.
- Reviews of a level can jump to any step and see which rule of a tip or step holds and which
  does not.
- `checkReferenceSolutions` and the developer mode share `levelSetup`; a change of how levels
  get their texts happens in one place.
