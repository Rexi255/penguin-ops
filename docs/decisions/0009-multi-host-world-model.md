# 0009. World model with several hosts from day one

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The curriculum (see `docs/CURRICULUM.md`) covers servers, services, networking and SSH, which
are core skills for IT specialists in system integration. Changing the engine's data model
from "one computer" to "several computers" later would be the most expensive kind of change.

## Decision

- The world consists of **hosts**. Each host has its own file system, users, groups, services
  and processes. A network connects the hosts (for `ping`, `ssh`, `scp`, `curl` to internal
  services and internal name resolution).
- The player's session belongs to one host at a time; the prompt shows `user@host`.
- The MVP uses a single host, but every API already takes the host into account.
- Long-term idea (not planned): a small simulated internet beyond the company network.

## Alternatives considered

- **Single computer only:** simplest, but no SSH, servers or networking chapters.
- **Full network simulation now (internet, routing, firewalls, VLANs):** huge effort with no
  benefit for the MVP.

## Consequences

- Slightly more complex core types in milestone M1.
- Chapters 9 and 10 (network, SSH) can be added without restructuring the engine.
