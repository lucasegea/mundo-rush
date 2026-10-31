# ADR-006 — One voice session per scene

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

One voice session per scene, minimal context, scripted openings and closings outside Live, 5 min cap on the server (§5.4)

## Rejected alternatives

Long session with context compression

## Trade-offs

Long conversational continuity

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Injecting the scripted opening as a prior turn and the `[DIRECTOR]` notes depends on mid-session `clientContent`. That it is accepted throughout the session with `user`/`model` roles is **verified** in the documentation; that an injected `model` turn does not trigger generation (`turnComplete: false`) is **assumed**: test against the fake Live server and a real test in the probe.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
