# ADR-003 — Single Zustand store + pure TS core + lint boundaries

- **Status:** Accepted (D-086/D-136, decided) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Single Zustand store split into slices + pure TS core; 3D and DOM only through the store; boundaries enforced by lint (§3, §4.3)

## Rejected alternatives

Redux Toolkit, Jotai, XState as the store

## Trade-offs

Automatic immutability

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

(a) The layer lint uses path resolution (`import-x/no-restricted-paths`, exact config in `03` §4.3.1), not just `no-restricted-imports`: relative paths do not evade it. (b) `ui/` reads **only** `state/selectors/**` and dispatches **only** from `state/actions.ts`; `world/` uses only `state/selectors/` and `state/bridge.ts`. (c) **Composition root** row (`main.tsx`, `App.tsx`, `boot/`): it is the only place that may import `ui/`, `world/` (deferred) and start `services/`.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
