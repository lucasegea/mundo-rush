# ADR-016 — Pruebas sin navegador

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Pruebas sin navegador: vitest (+ jsdom y test-renderer de R3F), tsc, lint, validadores y presupuestos; evaluación con modelos reales solo manual (§8)

## Alternativas descartadas

Playwright/E2E de navegador (prohibido por el operador)

## Qué se resigna

Detección automática de regresiones visuales

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

(a) "CI" = `npm run verify` local (no hay servidor de CI). (b) El DSP de los worklets (VAD, OLA, resample) se escribe como funciones puras en módulos aparte; el `AudioWorkletProcessor` es una cáscara sin lógica (jsdom no tiene `AudioWorkletGlobalScope`). (c) El lint se prueba con la API de ESLint (`lintText` con `filePath` virtual) o con fixtures fuera del lint raíz.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
