# ADR-007 — Turnos por actividad manual + VAD local + Terminé

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Turnos por actividad manual desde el cliente + VAD local + botón `Terminé`; audio solo durante el habla (resuelve DP-06)

## Alternativas descartadas

VAD automático del proveedor con umbral largo; solo botón

## Qué se resigna

Simplicidad del VAD del proveedor

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

API de actividad manual confirmada. La sonda F0.1 (bloque V) tiene que correr en modo manual (rama `probe/voice-cost`) y subir audio solo durante el habla; con el VAD automático del arnés de LT mediría un costo que el juego no va a tener.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
