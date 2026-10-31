# ADR-007 — Turns by manual activity + local VAD + Terminé

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Turns by manual activity from the client + local VAD + `Terminé` button; audio only during speech (resolves DP-06)

## Rejected alternatives

Provider automatic VAD with a long threshold; button only

## Trade-offs

Simplicity of the provider's VAD

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Manual activity API confirmed. The F0.1 probe (block V) has to run in manual mode (branch `probe/voice-cost`) and upload audio only during speech; with the automatic VAD of the LT harness it would measure a cost the game will not have.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
