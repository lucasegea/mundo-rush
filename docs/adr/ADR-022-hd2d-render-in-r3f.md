# ADR-022 — HD-2D render inside R3F

- **Status:** Accepted (D-139, decided) · amended (P0) · superseded by ADR-028 (D-207, 2026-10-13)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Accepted (D-139, decided))

## Decision

**HD-2D render inside R3F**: tiles merged per chunk with a pixel atlas (`nearest`), simple volumes, characters as billboards, tilted orthographic camera by presets, post-processing by tier (§2.9)

## Rejected alternatives

Pure 2D (Phaser/Pixi); low-poly 3D world (previous default of the architecture review, `07` option B); separate engine

## Trade-offs

Reusable 3D characters in VR (character art is redone if VR is reached)

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Post-processing in a deferred chunk that `low` and `dialog-only` never download, as the implementation; its own budget row is decided by D-160 (today: table unchanged). Camera snap + low-resolution render target option. D-154's integer pixel scale is not met on the vertical axis with a tilted camera (it is compressed by the sine of the pitch): this is inherent and is judged by eye in F0.2.

## Superseded by ADR-028

On 2026-10-12 the operator chose direction C, "painted diorama" (D-207, with the camera extension of D-208), and replaced HD-2D (D-139, D-154). **ADR-028** (painted diorama render inside R3F) takes the place of this decision; the HD-2D code was removed from the tree in the estetica-c plan M7. This decision remains as a record.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
