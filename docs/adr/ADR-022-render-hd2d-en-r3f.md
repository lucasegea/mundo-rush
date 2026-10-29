# ADR-022 — Render HD-2D dentro de R3F

- **Estado:** Aceptado (D-139, decidida) · enmendado (P0) · reemplazado por ADR-028 (D-207, 2026-10-13)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Aceptado (D-139, decidida))

## Decisión

Render **HD-2D dentro de R3F**: tiles fusionados por chunk con atlas pixel (`nearest`), volúmenes simples, personajes como billboards, cámara ortográfica inclinada por presets, postprocesado por tier (§2.9)

## Alternativas descartadas

2D puro (Phaser/Pixi); mundo 3D low-poly (default anterior de la revisión de arquitectura, `07` opción B); motor aparte

## Qué se resigna

Personajes 3D reutilizables en VR (el arte de personajes se rehace si se llega a VR)

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

Postprocesado en un chunk diferido que `low` y `dialog-only` nunca descargan, como implementación; la fila de presupuesto propia la decide D-160 (hoy: tabla sin cambios). Snap de cámara + opción de render target de baja resolución. La escala de píxel entera de D-154 no se cumple en el eje vertical con cámara inclinada (se comprime por el seno del pitch): es inherente y se mide a ojo en F0.2.

## Reemplazado por ADR-028

El 2026-10-12 el operador eligió la dirección C, "Maqueta pintada" (D-207, con la extensión de cámara de D-208), y reemplazó a HD-2D (D-139, D-154). **ADR-028** (render maqueta pintada dentro de R3F) toma el lugar de esta decisión; el código de HD-2D se retiró del árbol en el plan estetica-c M7. Esta decisión queda como registro.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
