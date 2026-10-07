# ADR-010 — Pipeline de assets (PNG para tiles y sprites, glTF para volúmenes)

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Pipeline glTF con gltf-transform y meshopt, registro de licencias obligatorio, instancias y fusión en build, layout como datos (§6.4)

## Alternativas descartadas

Draco, assets sin registro, editor de niveles

## Qué se resigna

Edición visual de niveles

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

Con HD-2D hay **dos caminos**: PNG (atlas de tiles y hojas de sprites, empaquetado sin resampleo) como pipeline principal, y glTF/meshopt solo para volúmenes.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
