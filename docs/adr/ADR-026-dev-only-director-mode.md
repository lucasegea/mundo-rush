# ADR-026 — Development-only director mode

- **Status:** Accepted (D-187, decided)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed (D-187 decided; form: planning, review of the architecture review pending))

## Decision

**Development-only director mode** (§6.5): live state through Vite's HMR channel to `.director/`, CLI + MCP for Claude Code, hot content reload, session journal; v1 with a DOM panel with its own store, `pickTile` through `bridge.ts`, copilot with the Claude Agent SDK in a development Node process, content-only changes, validated and committed; double key `DEV && VITE_LG_DIRECTOR` + `check:dev-only`

## Rejected alternatives

A feature inside the game behind a runtime flag; visual level editor; copilot inside `apps/server`; calling the model from the browser

## Trade-offs

Some in-house tooling that is not reused in production

## Notes

The form (v0 and v1) was written by planning and the review of the architecture review is pending (`03` §11); the decision (development-only director mode) is D-187, `decided`. The `03` §11 table still says "Proposed"; `04` and `05` (F1.1b) ask for "Accepted" per D-187.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
