# ADR-002 — Sin motor de física en el modo 1

- **Estado:** Aceptado (D-087, decidida)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Sin motor de física en el modo 1: grilla de caminabilidad + A* + colisión círculo-celda en el núcleo; Rapier solo como chunk opcional para la bicicleta (resuelve DP-14)

## Alternativas descartadas

Rapier, cannon-es, BVH contra malla

## Qué se resigna

Juguete físico estilo Bruno Simon en v1

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
