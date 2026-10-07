# ADR-018 — Modelos y precios en configuración

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Modelos y precios en configuración con adaptadores por rol; validación al arranque (§5.10)

## Alternativas descartadas

Ids de modelo en código

## Qué se resigna

—

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

La validación de modelos al arranque es una llamada de red: se saltea en tests y sin clave, y nunca corre dentro de `verify`.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
