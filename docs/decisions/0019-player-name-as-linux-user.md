# 0019. The player's name becomes the Linux user

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The prototype used the fixed German user name `azubi`. User names belong to the simulated
Linux world and must be English (ADR 0012). A personal account increases immersion.

## Decision

- On "New game" the player enters a name. It is shown on the save slot.
- A Linux user name is derived from it (lowercase, umlauts transliterated, e.g. "Jörg" →
  `joerg`) and can be edited. Allowed: lowercase letters, digits and hyphen, starting with a
  letter, at most 32 characters, like real Linux accounts. The prompt shows `<user>@<host>`.
- Check rules never depend on the user name. Tests replay every reference solution with two
  different user names.

## Alternatives considered

- **Fixed English name (e.g. `trainee`):** simple but impersonal.
- **Display name only, fixed Linux user:** compromise without a real benefit.

## Consequences

- Validation and derivation logic plus tests in the new-game flow.
- Documentation and screenshots use a default example name.
