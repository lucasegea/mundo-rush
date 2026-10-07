# ADR-024 — Servicio de pronunciación en el servidor

- **Estado:** Propuesto (D-150) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto (D-150))

## Decisión

Servicio de **pronunciación** en el servidor: `ScriptedAssessor` (Azure PA) + `RealizationRecognizer` (ZIPA ONNX) con tabla de confusiones L1; núcleo puro de recurrencia y habilitación por tipo; LLM nunca juez; sin audio en el servidor (§5.12)

## Alternativas descartadas

LLM multimodal como juez; ELSA/SpeechSuper como única fuente; reconocimiento en el navegador

## Qué se resigna

Cobertura de todos los tipos de error desde el día 1

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

ZIPA corre en `worker_threads`, nunca en el hilo del relay de audio; el runtime en Node (onnxruntime-node con fbank propia, o sherpa-onnx) lo prueba F0.1 desde Node, no solo en un notebook (D-163).

## Notas

D-150 está `pendiente` en `00`: el ADR vale como contrato por el default de D-088 hasta que el operador decida.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
