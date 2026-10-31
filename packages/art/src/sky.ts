// @lg/art sky.ts: the open world's sky measurements (open-world-3d T6, D-823), pure: the gradient dome that
// follows the camera (a 24 x 24 segment sphere: rings every 7.5°, because the default view sees the sky from 0° to
// about 11° and colors are interpolated between rings; with 12, every 15°, the top band came out pale, AC39) and the
// single cloud mesh
// (14 cumulus and 8 wisps from the V6 mockup atlas, one quad each), absent at `low`. world/sky draws them and the
// validate:content estimator counts them with these same numbers (what is estimated is what is drawn).
import { OPEN_WORLD_DENSITY, type WorldTier } from "./density.ts";
import type { BudgetEstimate } from "./costs.ts";

export const SKY_DOME = { radius: 500, widthSegments: 24, heightSegments: 24 } as const;
export const SKY_CLOUDS = { cumulus: 14, wisps: 8, distance: 380 } as const;

/** Triangles of the dome: those of three's SphereGeometry (the poles carry one triangle per segment, not two). */
export const SKY_DOME_TRIANGLES = SKY_DOME.widthSegments * SKY_DOME.heightSegments * 2 - 2 * SKY_DOME.widthSegments;
export const SKY_CLOUD_TRIANGLES = (SKY_CLOUDS.cumulus + SKY_CLOUDS.wisps) * 2;

/** Calls and triangles of the sky in a tier: the dome, plus the cloud mesh where there is one (AC38). */
export function skyEstimate(tier: WorldTier): BudgetEstimate {
  const clouds = OPEN_WORLD_DENSITY[tier].clouds;
  return { drawCalls: clouds ? 2 : 1, triangles: SKY_DOME_TRIANGLES + (clouds ? SKY_CLOUD_TRIANGLES : 0) };
}
