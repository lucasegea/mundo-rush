// @lg/art sky.ts: las medidas del cielo del mundo abierto (open-world-3d T6, D-823), puras: la cúpula de degradé que
// sigue a la cámara (una esfera de 24 x 24 segmentos: anillos cada 7,5°, porque la vista por defecto ve el cielo de 0° a
// unos 11° y los colores se interpolan entre anillos; con 12, cada 15°, la banda de arriba quedaba pálida, AC39) y la
// malla única de nubes
// (14 cúmulos y 8 jirones del atlas del mockup V6, un quad cada uno), ausente en `low`. world/sky las dibuja y el
// estimador de validate:content las cuenta con estos mismos números (lo estimado es lo dibujado).
import { OPEN_WORLD_DENSITY, type WorldTier } from "./density.ts";
import type { BudgetEstimate } from "./costs.ts";

export const SKY_DOME = { radius: 500, widthSegments: 24, heightSegments: 24 } as const;
export const SKY_CLOUDS = { cumulus: 14, wisps: 8, distance: 380 } as const;

/** Triángulos de la cúpula: los de SphereGeometry de three (los polos llevan un triángulo por segmento, no dos). */
export const SKY_DOME_TRIANGLES = SKY_DOME.widthSegments * SKY_DOME.heightSegments * 2 - 2 * SKY_DOME.widthSegments;
export const SKY_CLOUD_TRIANGLES = (SKY_CLOUDS.cumulus + SKY_CLOUDS.wisps) * 2;

/** Llamadas y triángulos del cielo en un tier: la cúpula, más la malla de nubes donde la hay (AC38). */
export function skyEstimate(tier: WorldTier): BudgetEstimate {
  const clouds = OPEN_WORLD_DENSITY[tier].clouds;
  return { drawCalls: clouds ? 2 : 1, triangles: SKY_DOME_TRIANGLES + (clouds ? SKY_CLOUD_TRIANGLES : 0) };
}
