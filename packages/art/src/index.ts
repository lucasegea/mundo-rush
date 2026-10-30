// @lg/art: dato y geometría de arte del look C (D-207), en TS puro: sin three, sin react, sin globals del DOM
// (bloque de pureza en eslint.config.js, como R4). Plan estetica-c M2, revisión de arquitectura 2026-10-12 §10 pregunta 3: lo importan
// world/ (en runtime: es dato de arte, no lógica de juego), scripts/assets/, scripts/a11y/contrast.ts y, en M5,
// packages/content-schema (para validar `tinte`). Marcador de zona: el fixture de límites comprueba que este archivo existe.
export const PACKAGE_NAME = "@lg/art";

export * from "./palette.ts";
export * from "./paint.ts";
export * from "./bevel.ts";
export * from "./tolerance.ts";
// Plan estetica-c M5: vocabulario de apariencia, forma del terreno y costos de dibujo (estimador de validate:content).
export * from "./looks.ts";
export * from "./terrain.ts";
export * from "./costs.ts";
export * from "./shapes.ts";
// Plan estetica-c M6: la densidad de la escena por tier (cómo entra `low` en su presupuesto).
export * from "./density.ts";
// Open-world-3d T6 (D-819): el relieve interior del mundo abierto.
export * from "./relief.ts";
// Open-world-3d T6 (D-832): el inventario de texturas del mundo abierto y la cuenta de bytes (KTX2 por cabecera).
export * from "./textures.ts";
// Open-world-3d T6 (D-823): las medidas del cielo (cúpula y nubes) que dibuja world/sky y cuenta el estimador.
export * from "./sky.ts";
export * from "./vegetation.ts";
// Open-world-3d T7b (D-838..D-842): el look del mundo (DEFAULT_LOOK y el catálogo WORLD_LOOKS), que world/ recibe como parámetro.
export * from "./worldLook.ts";
// Open-world-3d T9 (D-839): los colores del minimapa (fondo, camino y agua del look; punto y contorno de interfaz).
export * from "./minimap.ts";
