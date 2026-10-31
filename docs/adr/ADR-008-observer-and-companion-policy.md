# ADR-008 — Separate observer + deterministic companion policy

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Observer **multimodal** (clip + transcript, D-095) separate from the NPC + deterministic companion policy in the core, run on the server; Lumi lines from templates (§5.6, §3.5.2)

## Rejected alternatives

Having the NPC correct; having an LLM decide the interventions; freely generated Lumi

## Trade-offs

Spontaneity of Lumi

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Text correction: the observer is **multimodal** (in-memory audio clip of the turn + transcript, D-095), not "text-based" as the original row of `03` §11 said.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
