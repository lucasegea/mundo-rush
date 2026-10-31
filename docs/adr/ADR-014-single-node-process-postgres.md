# ADR-014 — One Node process + Postgres (today: local operator mode)

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

One Node process (static + API + WS + jobs) and managed Postgres with hand-written, verified SQL migrations; own auth with class login for minors (§7)

## Rejected alternatives

Supabase Auth (requires email), Firebase, JSON files (like LT)

## Trade-offs

Third-party managed auth

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Postgres arrives with F11.1 (postponed, D-135). Until then: local server on `127.0.0.1`, operator mode without login (`LG_OPERATOR_MODE=1`, D-158), stores behind interfaces with a file adapter (D-157). Cloud Run (D-102) does not apply while the game belongs to the operator.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
