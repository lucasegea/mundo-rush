# ADR-023 — Hybrid voice behind RealtimeVoiceProvider

- **Status:** Accepted (D-092, decided) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Accepted (D-092, decided; the pilot adapter is decided by D-149))

## Decision

**Hybrid** voice: `RealtimeVoiceProvider` with Live and cascade adapters that emit the same events, chosen by configuration; observer always with audio; ledger per adapter (§5.11)

## Rejected alternatives

Live only; cascade only; own WebRTC

## Trade-offs

A single, simpler voice path

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

Full contract (P0 §4.3): `turnId` on every event, `npcTextFinal` before the audio, `interrupted`, `sessionEnding`, usage as a discriminated union; methods `startTurn`, `endTurn`, `sendAudio`, `injectContext`, `interrupt`, `close`. (P0 §1 named the method `injectDirector`; `03` §11 integrated it as `injectContext` + `interrupt`, and `03` governs.)

## Notes

The pilot adapter (Live or cascade) is decided by D-149.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
