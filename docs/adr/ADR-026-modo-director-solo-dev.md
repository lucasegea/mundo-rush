# ADR-026 — Modo director solo de desarrollo

- **Estado:** Aceptado (D-187, decidida)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto (D-187 decidida; forma: planificación, revisión de la revisión de arquitectura pendiente))

## Decisión

**Modo director solo de desarrollo** (§6.5): estado vivo por el canal de HMR de Vite a `.director/`, CLI + MCP para Claude Code, recarga en caliente del contenido, diario de sesiones; v1 con panel DOM con store propio, `pickTile` por `bridge.ts`, copiloto con Claude Agent SDK en un proceso de Node de desarrollo, cambios solo de contenido, validados y commiteados; doble llave `DEV && VITE_LG_DIRECTOR` + `check:dev-only`

## Alternativas descartadas

Feature dentro del juego con bandera de runtime; editor visual de niveles; copiloto dentro de `apps/server`; llamar al modelo desde el navegador

## Qué se resigna

Un poco de tooling propio que no se reusa en producción

## Notas

La forma (v0 y v1) la escribió planificación y la revisión de la revisión de arquitectura está pendiente (`03` §11); la decisión (modo director solo de desarrollo) es D-187, `decidida`. La tabla de `03` §11 todavía dice "Propuesto"; `04` y `05` (F1.1b) piden "Aceptado" por D-187.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
