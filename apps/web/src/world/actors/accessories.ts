// world/actors/accessories.ts — los accesorios por código del personaje de Quaternius (open-world-3d T7, AC47): la gorra
// roja de la maqueta V6 (0xd6342c), el sombrero de paja, la boina y la bufanda. Se arman en las unidades del modelo (la
// escena del glTF: centro de la cabeza a 2,4, como la maqueta) y skinned.ts los cuelga de su hueso con `attach`. Cada
// grupo es UNA malla (una llamada) pintada por vértice; el material es el toon compartido.
// T7 SEAM: el pañuelo de cabeza y el poncho de la maqueta llegan con la pantalla de apariencia (diferida, D3).
import { SphereGeometry, type BufferGeometry } from "three";
import { CAP_COLOR } from "@lg/art";
import { mergeParts, painted, sphere, torus, type Paint } from "../props/geometry";
import type { CharacterLook } from "./looks";

/** Centro de la cabeza en unidades del modelo (maqueta V6). */
export const MODEL_HEAD_Y = 2.4;
/** Altura del cuello, para la bufanda (maqueta V6). */
export const MODEL_NECK_Y = 1.93;

const css = (rgb: number): Paint => `#${rgb.toString(16).padStart(6, "0")}`;
const shade = (rgb: number, k: number): number =>
  (Math.round(((rgb >> 16) & 255) * k) << 16) | (Math.round(((rgb >> 8) & 255) * k) << 8) | Math.round((rgb & 255) * k);
/** El color tal cual (la gorra se mide contra 0xd6342c). */
const FLAT = { top: 0, bottomDark: 0, jitter: 0 } as const;

/** La gorra de la maqueta: casquete, visera hacia +z y botón. */
export function capGeometry(seed = 0): BufferGeometry {
  const y = MODEL_HEAD_Y;
  return mergeParts([
    painted(new SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.5, 0.5, 0.54).rotateX(-0.12).translate(0, y + 0.07, -0.02), css(CAP_COLOR), seed, FLAT),
    painted(sphere(1, 18, 6).scale(0.36, 0.045, 0.3).rotateX(0.14).translate(0, y + 0.1, 0.48), css(shade(CAP_COLOR, 0.86)), seed, FLAT),
    painted(sphere(1, 8, 6).scale(0.06, 0.06, 0.06).translate(0, y + 0.58, -0.04), "papel", seed, FLAT),
  ]);
}

function hat(look: CharacterLook, seed: number): BufferGeometry | null {
  const y = MODEL_HEAD_Y;
  switch (look.hat) {
    case "gorra":
      return capGeometry(seed);
    case "paja":
      return mergeParts([
        painted(sphere(1, 24, 5).scale(0.92, 0.07, 0.92).translate(0, y + 0.2, 0), "paja", seed, { jitter: 0.12 }),
        painted(sphere(1, 20, 9).scale(0.5, 0.32, 0.5).translate(0, y + 0.34, 0), "paja", seed, { jitter: 0.12 }),
        painted(torus(0.5, 0.05, 6, 20).rotateX(Math.PI / 2).translate(0, y + 0.3, 0), "techo", seed),
      ]);
    case "boina":
      return mergeParts([
        painted(sphere(0.5, 14, 6).scale(1, 0.32, 1).rotateZ(-0.12).translate(0.03, y + 0.36, -0.03), "pantalon", seed),
        painted(sphere(0.06, 6, 4).translate(0.02, y + 0.52, -0.02), "pantalon", seed),
      ]);
    default:
      return null;
  }
}

function neck(look: CharacterLook, seed: number): BufferGeometry | null {
  if (look.scarf !== "bufanda") return null;
  return mergeParts([painted(torus(0.3, 0.1, 8, 20).rotateX(Math.PI / 2).scale(1, 1, 0.9).translate(0, MODEL_NECK_Y, 0.06), "techo", seed)]);
}

/** Los accesorios de una apariencia: el de la cabeza (sombrero o gorra) y el del cuello, o null. */
export function openWorldAccessories(look: CharacterLook, seed = 0): { head: BufferGeometry | null; neck: BufferGeometry | null } {
  return { head: hat(look, seed), neck: neck(look, seed) };
}
