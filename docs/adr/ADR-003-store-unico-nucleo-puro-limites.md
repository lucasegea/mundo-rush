# ADR-003 — Store único Zustand + núcleo TS puro + límites por lint

- **Estado:** Aceptado (D-086/D-136, decidida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Store único Zustand por slices + núcleo TS puro; 3D y DOM solo por el store; límites por lint (§3, §4.3)

## Alternativas descartadas

Redux Toolkit, Jotai, XState como store

## Qué se resigna

Inmutabilidad automática

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

(a) El lint de capas se hace con resolución de rutas (`import-x/no-restricted-paths`, config exacta en `03` §4.3.1), no solo con `no-restricted-imports`: las rutas relativas no lo evaden. (b) `ui/` lee **solo** `state/selectors/**` y despacha **solo** desde `state/actions.ts`; `world/` usa solo `state/selectors/` y `state/bridge.ts`. (c) Fila de la **raíz de composición** (`main.tsx`, `App.tsx`, `boot/`): es el único lugar que puede importar `ui/`, `world/` (diferido) y arrancar `services/`.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
