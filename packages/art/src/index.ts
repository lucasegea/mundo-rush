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
