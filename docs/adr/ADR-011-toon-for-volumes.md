# ADR-011 — Toon material for volumes

- **Status:** Proposed (amended 2026-10-06 by ADR-022; amended 2026-10-13 by ADR-028)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed (amended 2026-10-06))

## Decision

A single toon material with a 2-3 band ramp for the **volumes** that need it; outlines only on interactives; post-processing becomes a tier effect (amended by ADR-022) (§2.8)

## Rejected alternatives

Post-process outline; PBR materials

## Trade-offs

Perfect outlines on everything

## Notes

Amended on 2026-10-06 by **ADR-022** (HD-2D render): toon becomes only for volumes that need it and post-processing is a tier effect. It is not a P0 amendment.

Amended on 2026-10-13 by **ADR-028** (painted diorama render, D-207): a single 4-band toon material instance with brushwork and vertex color for the whole world (terrain, props, characters), water with its own shader, and no outlines in v1 (the NPC being talked to is read by its highlighted label). It is not a P0 amendment.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
