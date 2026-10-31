# ADR-018 — Models and prices in configuration

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Models and prices in configuration with per-role adapters; validation at startup (§5.10)

## Rejected alternatives

Model ids in code

## Trade-offs

—

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Model validation at startup is a network call: it is skipped in tests and without a key, and never runs inside `verify`.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
