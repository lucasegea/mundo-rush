# ADR-025 — Day-1 seams (R10-R15)

- **Status:** Proposed (D-145) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed (D-145))

## Decision

**Day-1 seams R10-R15** (semantic input, camera by presets, tiers as a contract, audio and voice behind interfaces, UI as view-models, platform behind an adapter), with lint and tests (§3.1)

## Rejected alternatives

Add them when each target arrives

## Trade-offs

Some early indirection

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Exact lint config in `03` §4.3.1. Clarification of R10: React JSX handlers (`onKeyDown` on a `<button>` in `ui/`; R3F `onClick`/`onPointerDown` on meshes in `world/`) are **not** device listeners and remain allowed; what is forbidden are global listeners (`window`/`document`/canvas) and `navigator.getGamepads`. R3F events only dispatch semantic actions through `bridge.ts`.

## Notes

D-145 is `pending` in `00`: the ADR stands as a contract by the default of D-088.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
