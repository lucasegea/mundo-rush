# ADR-011 — Toon material para volúmenes

- **Estado:** Propuesto (enmendado 2026-10-06 por ADR-022; enmendado 2026-10-13 por ADR-028)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto (enmendado 2026-10-06))

## Decisión

Toon material único con rampa de 2-3 bandas para los **volúmenes** que lo necesiten; contornos solo en interactivos; el postprocesado pasa a ser efecto de tier (enmendado por ADR-022) (§2.8)

## Alternativas descartadas

Contorno por postproceso; materiales PBR

## Qué se resigna

Contornos perfectos en todo

## Notas

Enmendado el 2026-10-06 por **ADR-022** (render HD-2D): el toon pasa a ser solo para volúmenes que lo necesiten y el postprocesado es un efecto de tier. No es una enmienda de P0.

Enmendado el 2026-10-13 por **ADR-028** (render maqueta pintada, D-207): una sola instancia de material toon de 4 bandas con pincelada y color por vértice para todo el mundo (terreno, props, personajes), el agua con shader propio, y sin contornos en v1 (el NPC con el que se habla se lee por su etiqueta resaltada). No es una enmienda de P0.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
