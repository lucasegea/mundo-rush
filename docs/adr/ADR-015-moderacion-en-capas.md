# ADR-015 — Moderación en capas con holdback

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Moderación en capas con holdback de audio y corte en voz; síncrona en texto (resuelve DP-37)

## Alternativas descartadas

Solo prompt; retrasar todo el audio hasta moderar cada oración

## Qué se resigna

Latencia cero en cuentas de menores

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

El holdback vive en `scene-runtime`, **por encima** de los adaptadores de voz. En cascada el texto del NPC existe antes que el audio: se modera **antes** del TTS y el riesgo residual es cero; el holdback aplica solo a Live. El contrato de `RealtimeVoiceProvider` expone ese texto (`npcTextFinal`).

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
