# ADR-028: Render maqueta pintada dentro de R3F

- **Estado:** Aceptado (D-207, decidida) · reemplaza a ADR-022 · enmienda a ADR-011 · enmendado 2026-10-30 por D-209
- **Fecha:** 2026-10-12 (decisión del operador, D-207) · extensión de cámara 2026-10-13 (D-208) · escrito el 2026-10-13 (plan estetica-c M7)
- **Fuente:** `docs/03-arquitectura.md` §2.8, §2.9 y §11 (estado en la tabla de `03`: Aceptado (D-207, decidida)); biblia de arte `docs/estetica/propuesta-c-maqueta-pintada.md`; plan `docs/plans/estetica-c-refactor.md`

## Decisión

Render **maqueta pintada dentro de R3F** (D-207, D-208): el valle como una maqueta de juguete pintada a mano, con el mismo stack (Vite, React, R3F, drei) y los mismos datos, grilla, movimiento, input y store que antes.

- **Terreno:** malla de alturas continua con color por vértice, derivada del layout del diorama en el formato de la maqueta (caminos y ríos por curvas, estanques por polígonos, detalle por zonas); plana dentro de los límites caminables, lomas afuera, y extendida 160 m más allá del diorama (D-208).
- **Props:** constructores redondeados por código (`codigo/*`) y modelos CC0 repintados a la paleta por el pipeline (`modelo/*`); ningún volumen visible con aristas de 90° sin bisel, con test diedro.
- **Personajes:** chibi 3D con esqueleto, cuerpo base repintado y cabeza por código, apariencia por ficha de contenido; retratos de solo-diálogo renderizados del mismo modelo.
- **Material:** una sola instancia de toon de 4 bandas con pincelada y color por vértice para todo el mundo; el agua con shader propio; registro cerrado de clases de material; sin contornos en v1.
- **Cámara:** presets de R11 `perspective3D` (lente largo: FOV 30°, inclinación 50°, giro 45°, escalera de zoom de 8 pasos de 160 a 22 m con inicio en 30 m, D-208) y `dialogueFrame` (plano de a dos en 3/4); `xrTabletop` declarado. Sin cámaras ortográficas.
- **Postprocesado:** por tier y en su propio chunk (bloom en `medium`; bloom, tilt-shift y viñeta en `high`).

## Alternativas descartadas

HD-2D (ADR-022, D-139: tiles pixel por chunk, personajes como billboards, cámara ortográfica); "Mapa pintado" y "Valle soleado" (propuestas A y B de `docs/estetica/`); 3D low-poly genérico sin bisel ni pintura

## Qué se resigna

La lectura de píxel de HD-2D; texturas pintadas a mano por pieza (el color va por vértice); contornos en v1; los presets ortográficos de cámara

## Notas

Reemplaza a **ADR-022** (D-207 reemplaza a D-139 y a D-154) y enmienda a **ADR-011** (el toon pasa a ser el material de todo el mundo). El código de HD-2D se retiró en el plan estetica-c M7 y `scripts/lint/retiro-hd2d.test.ts` impide que vuelva: no hay `OrthographicCamera` en `apps/` ni en `packages/`, y el filtro `nearest` solo vive en la rampa del toon. El esquema de contenido rechaza las claves `tiles` y `atlas_tiles` con un mensaje que apunta al formato de la maqueta.

## Enmienda D-209 (2026-10-30)

Plan open-world-3d, por dirección del operador del 2026-10-27; fila D-209 de `00-decisiones.md`. Este archivo no se reescribe; la enmienda se suma acá.

- **Cámara:** el default pasa a `thirdPerson`, detrás del personaje, con mirada por arrastre o con Q y R y zoom continuo de 2,5 m al mapa entero (V alterna). `perspective3D` y su escalera de 8 pasos quedan registrados como panorama; `dialogueFrame` no cambia.
- **Mundo:** abierto, de unos 140 × 100 m, con relieve, pasto instanciado, árboles horneados en build con impostores, cielo de domo y minimapa.
- **Material:** sin contornos en ningún tier. El registro cerrado pasa a diez clases (`toon`, `agua`, `etiqueta`, `sombra-blob`, `terreno`, `pasto`, `follaje`, `impostor`, `cielo`, `nube`).
- **Texturas:** el color sigue por vértice. Solo los mapas fotográficos de suelo y roca, el atlas de hojas y la corteza se sirven como KTX2 externos registrados.
- **Postprocesado:** el tilt-shift corre solo en el panorama y en la charla.
- **Personaje:** el del mundo abierto entra por el mismo pipeline de personajes.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
