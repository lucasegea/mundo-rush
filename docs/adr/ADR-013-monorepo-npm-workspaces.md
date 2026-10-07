# ADR-013 — Monorepo con npm workspaces

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Monorepo con npm workspaces (`apps/web`, `apps/server`, `packages/core`, `packages/content-schema`, `packages/protocol`) (§4)

## Alternativas descartadas

Paquete único; pnpm + turborepo

## Qué se resigna

Simplicidad de un solo `package.json`

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

Paquetes con nombre `@lg/core`, `@lg/protocol`, `@lg/content-schema` (el lint los necesita). `test.projects` reemplaza a `vitest.workspace.ts` (deprecado; F1.1a lo confirmó con vitest 5). `experiments/` queda fuera de `tsc`, `eslint` y `vitest` raíz.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
