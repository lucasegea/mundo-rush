# ADR-024 — Pronunciation service on the server

- **Status:** Proposed (D-150) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed (D-150))

## Decision

**Pronunciation** service on the server: `ScriptedAssessor` (Azure PA) + `RealizationRecognizer` (ZIPA ONNX) with an L1 confusion table; pure core for recurrence and per-type enabling; the LLM is never the judge; no audio on the server (§5.12)

## Rejected alternatives

Multimodal LLM as judge; ELSA/SpeechSuper as the sole source; in-browser recognition

## Trade-offs

Coverage of all error types from day 1

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

ZIPA runs in `worker_threads`, never on the audio relay thread; the Node runtime (onnxruntime-node with own fbank, or sherpa-onnx) is tested by F0.1 from Node, not just in a notebook (D-163).

## Notes

D-150 is `pending` in `00`: the ADR stands as a contract by the default of D-088 until the operator decides.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
