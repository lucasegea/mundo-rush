# ADR-004 — Progress as a fold of evidence events

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Progress as a fold of evidence events emitted by the server; potions in whole thirds (§3.5.3)

## Rejected alternatives

Mutable balances on the account

## Trade-offs

Initial simplicity; requires a materialized view

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

The source of truth remains the event log, but while F11 is postponed the log needs a store: an `EvidenceStore` interface with an append-only file adapter in `apps/server/data/` (D-157). Without this, F7 closes with progress that is lost when the server restarts.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
