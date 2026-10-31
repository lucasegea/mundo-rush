# ADR-002 — No physics engine in mode 1

- **Status:** Accepted (D-087, decided)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

No physics engine in mode 1: walkability grid + A* + circle-cell collision in the core; Rapier only as an optional chunk for the bicycle (resolves DP-14)

## Rejected alternatives

Rapier, cannon-es, BVH against mesh

## Trade-offs

A Bruno Simon-style physics toy in v1

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
