# ADR-009 — Contenido en YAML + zod, compilado a JSON

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Contenido en YAML con claves del GDD, schemas zod, compilado a JSON, validaciones cruzadas como gate (§6.1)

## Alternativas descartadas

JSON a mano, TS como contenido, CMS

## Qué se resigna

Ergonomía de un editor visual

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

Agregar al árbol `content/retired-ids.yaml` y `content/lint-allowlist.yaml` (P0 T5; los usan `03` §6.1 y F1.2). La salida compilada queda fuera de git (D-159).

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
