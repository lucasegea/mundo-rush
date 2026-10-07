# ADR-012 — Tiers de calidad

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Tiers `low/medium/high/dialog-only` con detección propia y degradación en caliente; 30 FPS en conversación (§2.7)

## Alternativas descartadas

Un solo nivel de calidad; base de datos de GPUs de terceros

## Qué se resigna

Máxima fidelidad automática

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

El tipo de tier incluye `xr` reservado (R12): `'low' | 'medium' | 'high' | 'dialog-only' | 'xr'`. Se suma como opción a medir en F0.2 el render a resolución interna baja con reescalado `nearest` (técnica estándar del HD-2D, ahorra fragmentos en `low`).

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
