# ADR-005 — Own voice gateway (port of an earlier voice prototype)

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Port modules from an earlier voice prototype into our own gateway that builds the `setup` on the server; no ephemeral tokens in v1; LT stays as a lab (§5.2-5.3)

## Rejected alternatives

Use LT as a service; shared package; direct ephemeral tokens

## Trade-offs

Lowest possible latency; a single voice codebase

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

The port has to: explicitly request input and output transcriptions (`inputAudioTranscription`/`outputAudioTranscription`), use manual activity (`realtimeInputConfig.automaticActivityDetection.disabled` + `activityStart`/`activityEnd`), frame audio as binary, and not log content (LT logs the first 400 characters of every non-audio message, `setup` included). It is more "rewrite with provenance" than "port"; the F5.1 estimate reflects this.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
