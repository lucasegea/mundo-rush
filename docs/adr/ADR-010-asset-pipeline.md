# ADR-010 — Asset pipeline (PNG for tiles and sprites, glTF for volumes)

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

glTF pipeline with gltf-transform and meshopt, mandatory license registry, instancing and merging at build, layout as data (§6.4)

## Rejected alternatives

Draco, assets without a registry, level editor

## Trade-offs

Visual level editing

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

With HD-2D there are **two paths**: PNG (tile atlases and sprite sheets, packed without resampling) as the main pipeline, and glTF/meshopt only for volumes.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
