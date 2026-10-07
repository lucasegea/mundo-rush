# ADR-025 — Costuras del día 1 (R10-R15)

- **Estado:** Propuesto (D-145) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto (D-145))

## Decisión

**Costuras del día 1 R10-R15** (input semántico, cámara por presets, tiers como contrato, audio y voz detrás de interfaces, UI como view-models, plataforma detrás de un adaptador), con lint y tests (§3.1)

## Alternativas descartadas

Agregarlas cuando llegue cada destino

## Qué se resigna

Algo de indirección temprana

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

Config exacta de lint en `03` §4.3.1. Precisión de R10: los handlers JSX de React (`onKeyDown` en un `<button>` de `ui/`; `onClick`/`onPointerDown` de R3F en mallas de `world/`) **no** son listeners de dispositivo y siguen permitidos; lo prohibido son los listeners globales (`window`/`document`/canvas) y `navigator.getGamepads`. Los eventos de R3F solo despachan acciones semánticas por `bridge.ts`.

## Notas

D-145 está `pendiente` en `00`: el ADR vale como contrato por el default de D-088.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
