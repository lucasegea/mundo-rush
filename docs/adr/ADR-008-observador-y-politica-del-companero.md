# ADR-008 — Observador separado + política del compañero determinística

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Observador **multimodal** (clip + transcripción, D-095) separado del NPC + política del compañero determinística en el núcleo, ejecutada en el servidor; líneas de Lumi por plantillas (§5.6, §3.5.2)

## Alternativas descartadas

Que el NPC corrija; que un LLM decida las intervenciones; Lumi generada libremente

## Qué se resigna

Espontaneidad de Lumi

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

Corrección de texto: el observador es **multimodal** (clip de audio de la vuelta en memoria + transcripción, D-095), no "de texto" como decía la fila original de `03` §11.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
