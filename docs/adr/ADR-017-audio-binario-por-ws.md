# ADR-017 — Audio binario por WebSocket

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Audio en marcos binarios por WS, worklets fuera del hilo principal; Opus solo si la medición lo exige (§5.5.5)

## Alternativas descartadas

base64 en JSON (LT); Opus desde el día 1; WebRTC

## Qué se resigna

Mínimo ancho de banda posible en v1

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
