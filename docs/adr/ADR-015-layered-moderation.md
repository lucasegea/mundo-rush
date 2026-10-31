# ADR-015 — Layered moderation with holdback

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Layered moderation with audio holdback and voice cut-off; synchronous on text (resolves DP-37)

## Rejected alternatives

Prompt only; delaying all audio until each sentence is moderated

## Trade-offs

Zero latency on minors' accounts

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

The holdback lives in `scene-runtime`, **above** the voice adapters. In cascade the NPC text exists before the audio: it is moderated **before** the TTS and the residual risk is zero; the holdback applies only to Live. The `RealtimeVoiceProvider` contract exposes that text (`npcTextFinal`).

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
