# ADR-013 — Monorepo with npm workspaces

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Monorepo with npm workspaces (`apps/web`, `apps/server`, `packages/core`, `packages/content-schema`, `packages/protocol`) (§4)

## Rejected alternatives

Single package; pnpm + turborepo

## Trade-offs

Simplicity of a single `package.json`

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Packages named `@lg/core`, `@lg/protocol`, `@lg/content-schema` (the lint needs them). `test.projects` replaces `vitest.workspace.ts` (deprecated; F1.1a confirmed it with vitest 5). `experiments/` stays out of the root `tsc`, `eslint` and `vitest`.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
