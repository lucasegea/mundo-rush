# ADR-009 — Content in YAML + zod, compiled to JSON

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Content in YAML with GDD keys, zod schemas, compiled to JSON, cross-validations as a gate (§6.1)

## Rejected alternatives

Hand-written JSON, TS as content, CMS

## Trade-offs

Ergonomics of a visual editor

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Add `content/retired-ids.yaml` and `content/lint-allowlist.yaml` to the tree (P0 T5; used by `03` §6.1 and F1.2). The compiled output stays out of git (D-159).

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
