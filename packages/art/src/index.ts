// @lg/art: art data and geometry of look C (D-207), in pure TS: no three, no react, no DOM globals
// (purity block in eslint.config.js, like R4). Plan estetica-c M2, architecture review 2026-10-12 §10 question 3: imported by
// world/ (at runtime: it is art data, not game logic), scripts/assets/, scripts/a11y/contrast.ts and, in M5,
// packages/content-schema (to validate `tinte`). Zone marker: the bounds fixture checks that this file exists.
export const PACKAGE_NAME = "@lg/art";

export * from "./palette.ts";
export * from "./paint.ts";
export * from "./bevel.ts";
export * from "./tolerance.ts";
// Plan estetica-c M5: appearance vocabulary, terrain shape and draw costs (validate:content estimator).
export * from "./looks.ts";
export * from "./terrain.ts";
export * from "./costs.ts";
export * from "./shapes.ts";
// Plan estetica-c M6: scene density per tier (how `low` fits in its budget).
export * from "./density.ts";
// Open-world-3d T6 (D-819): the open world's interior relief.
export * from "./relief.ts";
// Open-world-3d T6 (D-832): the open world's texture inventory and byte count (KTX2 by header).
export * from "./textures.ts";
// Open-world-3d T6 (D-823): the sky measurements (dome and clouds) that world/sky draws and the estimator counts.
export * from "./sky.ts";
export * from "./vegetation.ts";
// Open-world-3d T7b (D-838..D-842): the world look (DEFAULT_LOOK and the WORLD_LOOKS catalog), which world/ receives as a parameter.
export * from "./worldLook.ts";
// Open-world-3d T9 (D-839): the minimap colors (background, path and water from the look; UI dot and outline).
export * from "./minimap.ts";
