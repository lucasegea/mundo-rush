// world/actors/accessories.ts — the code-built accessories for the Quaternius character (open-world-3d T7, AC47): the
// red cap from the V6 diorama (the look's `capColor`), the straw hat, the beret and the scarf. They are built in the
// model's units (the glTF scene: head center at 2.4, like the diorama) and skinned.ts hangs them from their bone with
// `attach`. Each group is ONE mesh (one draw call) painted per vertex; the material is the shared toon one.
// Open-world-3d T7b (D-840): the accessories are a table per accessory set of the look (`characters.accessories`), not
// a switch; a look with another set (other hats, another neckwear) adds a row to ACCESSORY_TABLE.
// T7 SEAM: the head scarf and the poncho from the diorama arrive with the appearance screen (deferred, D3).
import { SphereGeometry, type BufferGeometry } from "three";
import type { AccessorySetId, Hat, Scarf, WorldLook } from "@lg/art";
import { mergeParts, painted, sphere, torus, type Paint } from "../props/geometry";
import type { CharacterLook } from "./looks";

/** What the accessories read from the look: its set and the cap color. */
export type AccessoryCast = Pick<WorldLook["characters"], "accessories" | "capColor">;
type Build = (seed: number, cast: AccessoryCast) => BufferGeometry;

/** Head center in model units (V6 diorama). */
export const MODEL_HEAD_Y = 2.4;
/** Neck height, for the scarf (V6 diorama). */
export const MODEL_NECK_Y = 1.93;

const css = (rgb: number): Paint => `#${rgb.toString(16).padStart(6, "0")}`;
const shade = (rgb: number, k: number): number =>
  (Math.round(((rgb >> 16) & 255) * k) << 16) | (Math.round(((rgb >> 8) & 255) * k) << 8) | Math.round((rgb & 255) * k);
/** The color as is (the cap is measured against the look's `capColor`). */
const FLAT = { top: 0, bottomDark: 0, jitter: 0 } as const;

/** The diorama's cap: skullcap, visor toward +z and button, in color `color` (0xRRGGBB). */
export function capGeometry(color: number, seed = 0): BufferGeometry {
  const y = MODEL_HEAD_Y;
  return mergeParts([
    painted(new SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.5, 0.5, 0.54).rotateX(-0.12).translate(0, y + 0.07, -0.02), css(color), seed, FLAT),
    painted(sphere(1, 18, 6).scale(0.36, 0.045, 0.3).rotateX(0.14).translate(0, y + 0.1, 0.48), css(shade(color, 0.86)), seed, FLAT),
    painted(sphere(1, 8, 6).scale(0.06, 0.06, 0.06).translate(0, y + 0.58, -0.04), "papel", seed, FLAT),
  ]);
}

/** An accessory set: one builder per hat and per neckwear (an absent one is not drawn). */
export interface AccessorySet {
  hats: Readonly<Partial<Record<Hat, Build>>>;
  necks: Readonly<Partial<Record<Scarf, Build>>>;
}

/** The accessory sets by id (`WorldLook.characters.accessories`). `v6`: the ones from the V6 diorama. */
export const ACCESSORY_TABLE: Readonly<Record<AccessorySetId, AccessorySet>> = {
  v6: {
    hats: {
      gorra: (seed, cast) => capGeometry(cast.capColor, seed),
      paja: (seed) => mergeParts([
        painted(sphere(1, 24, 5).scale(0.92, 0.07, 0.92).translate(0, MODEL_HEAD_Y + 0.2, 0), "paja", seed, { jitter: 0.12 }),
        painted(sphere(1, 20, 9).scale(0.5, 0.32, 0.5).translate(0, MODEL_HEAD_Y + 0.34, 0), "paja", seed, { jitter: 0.12 }),
        painted(torus(0.5, 0.05, 6, 20).rotateX(Math.PI / 2).translate(0, MODEL_HEAD_Y + 0.3, 0), "techo", seed),
      ]),
      boina: (seed) => mergeParts([
        painted(sphere(0.5, 14, 6).scale(1, 0.32, 1).rotateZ(-0.12).translate(0.03, MODEL_HEAD_Y + 0.36, -0.03), "pantalon", seed),
        painted(sphere(0.06, 6, 4).translate(0.02, MODEL_HEAD_Y + 0.52, -0.02), "pantalon", seed),
      ]),
    },
    necks: {
      bufanda: (seed) => mergeParts([painted(torus(0.3, 0.1, 8, 20).rotateX(Math.PI / 2).scale(1, 1, 0.9).translate(0, MODEL_NECK_Y, 0.06), "techo", seed)]),
    },
  },
};

/** The accessories of an appearance with the look's set: the head one (hat or cap) and the neck one, or null. */
export function openWorldAccessories(look: CharacterLook, cast: AccessoryCast, seed = 0): { head: BufferGeometry | null; neck: BufferGeometry | null } {
  const set = ACCESSORY_TABLE[cast.accessories];
  const head = look.hat ? set.hats[look.hat] : undefined;
  const neck = look.scarf ? set.necks[look.scarf] : undefined;
  return { head: head ? head(seed, cast) : null, neck: neck ? neck(seed, cast) : null };
}
