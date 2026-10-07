# ADR-023 — Voz híbrida detrás de RealtimeVoiceProvider

- **Estado:** Aceptado (D-092, decidida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Aceptado (D-092, decidida; el adaptador del piloto lo decide D-149))

## Decisión

Voz **híbrida**: `RealtimeVoiceProvider` con adaptadores Live y cascada que emiten los mismos eventos, elegidos por configuración; observador siempre con audio; ledger por adaptador (§5.11)

## Alternativas descartadas

Solo Live; solo cascada; WebRTC propio

## Qué se resigna

Una sola vía de voz más simple

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

Contrato completo (P0 §4.3): `turnId` en todo evento, `npcTextFinal` antes del audio, `interrupted`, `sessionEnding`, uso como unión discriminada; métodos `startTurn`, `endTurn`, `sendAudio`, `injectContext`, `interrupt`, `close`. (P0 §1 nombraba el método `injectDirector`; `03` §11 lo integró como `injectContext` + `interrupt`, y rige `03`.)

## Notas

El adaptador del piloto (Live o cascada) lo decide D-149.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
