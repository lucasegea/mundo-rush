# ADR-012 — Quality tiers

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Tiers `low/medium/high/dialog-only` with own detection and hot degradation; 30 FPS in conversation (§2.7)

## Rejected alternatives

A single quality level; third-party GPU database

## Trade-offs

Maximum automatic fidelity

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

The tier type includes a reserved `xr` (R12): `'low' | 'medium' | 'high' | 'dialog-only' | 'xr'`. Rendering at low internal resolution with `nearest` upscaling (a standard HD-2D technique, saves fragments in `low`) is added as an option to measure in F0.2.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
