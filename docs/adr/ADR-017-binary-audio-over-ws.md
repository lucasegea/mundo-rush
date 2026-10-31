# ADR-017 — Binary audio over WebSocket

- **Status:** Proposed (D-088: contract until the operator decides)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Audio in binary frames over WS, worklets off the main thread; Opus only if measurement demands it (§5.5.5)

## Rejected alternatives

base64 in JSON (LT); Opus from day 1; WebRTC

## Trade-offs

Minimum possible bandwidth in v1

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
