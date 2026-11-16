# 0004. Simulate Linux instead of running a real shell

- Status: Accepted
- Date: 2026-11-16
- Supersedes: –

## Context

The game teaches Linux commands. Commands could either be simulated (as in the prototype) or
run for real in a sandbox (temporary directory, container, bubblewrap, namespaces). The
primary platform is Windows, where no Linux shell exists without WSL or Docker. Every level
must be testable automatically and reproducibly. Later chapters need several servers,
services, users and a network.

## Decision

- PenguinOps **simulates** the Linux system: file system, users, permissions, shell and
  commands are implemented in TypeScript (see ADR 0006–0009).
- The simulated system is **Debian 13**. Command output and error messages follow Debian 13
  (GNU coreutils, bash) with the default English locale.
- A later milestone (M6) adds **differential tests**: CI runs a curated list of command cases
  both in the simulation and in the official Debian 13 container image and compares stdout,
  stderr and exit code. Cases with inherently different output (timestamps, real owners) get
  documented exceptions.
- Features that are not simulated are reported honestly through a game notice (ADR 0007),
  never by pretending to work.

## Alternatives considered

- **Real shell in a sandbox:** 100 % realistic, but impossible on Windows without WSL or
  Docker, hard to test deterministically, unsafe if misconfigured, and unable to show several
  servers, systemd or a company network convincingly. Rejected.
- **Simulation without differential tests:** cheaper, but AI-written simulations tend to
  invent plausible but wrong behaviour that the owner cannot spot. The differential tests are
  the safety net.

## Consequences

- Every command is implementation work and needs tests.
- The simulation runs everywhere, is safe, deterministic and fast to test.
- The game can show things a sandbox cannot (other users, root, services, many servers).
- Pinning Debian 13 gives one clear reference for "correct" behaviour.
