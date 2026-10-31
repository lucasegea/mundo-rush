// world/dioramas/look.ts — a diorama's look (open-world-3d T7b, D-839, D-840). It is resolved ONCE, when loading the
// diorama (GameCanvas), and goes down as a parameter to the scene, light, fog, background, water and characters; no
// component deduces it again from the relief.
// T7b SEAM (deferred by the plan): when the universe manifest names its look (`look`, with reader and validation),
// this reads it from there. Until then the catalog has the two looks the game draws at 0034931 and this is the only
// point in world/ where `relieve` picks them: the open world (with relief) takes DEFAULT_LOOK and the flat dioramas
// (farmer, the Galeano plaza) the painted look C from m7. Without a diorama (the canvas before loading), the painted one: the usual
// haze background and fog. Open-world-3d T9: the rule itself is `lookForRelief` from @lg/art, the same one the
// minimap uses (ui/ does not import world/), so there are no two copies.
import { lookForRelief, type WorldLook } from "@lg/art";
import type { DioramaRuntime } from "@lg/core";

export function lookForDiorama(diorama: Pick<DioramaRuntime, "ground"> | null): WorldLook {
  return lookForRelief(diorama?.ground.terrain.relief === true);
}
