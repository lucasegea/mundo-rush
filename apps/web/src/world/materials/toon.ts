// world/materials/toon.ts — datos y texturas del material único del mundo (propuesta C §7, plan estetica-c M1 ítem 6):
// rampa de 4 bandas (luminancia 150 / 195 / 232 / 255, filtro nearest: la sombra es clara, nunca negra) y una textura
// de pincelada de 256 px en grises (manchas de 205 a 255) generada por código con semilla fija. Los datos son
// funciones puras (testeables sin GPU); las texturas de three salen de ellos.
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NearestFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace } from "three";
import { rng } from "./rng";

export const TOON_BANDS = [150, 195, 232, 255] as const;
export const BRUSH_SIZE = 256;
export const BRUSH_MIN = 205;
export const BRUSH_MAX = 255;
/** Repeticiones de la pincelada sobre el terreno (propuesta C §7). */
export const BRUSH_REPEAT = 10;
export const BRUSH_SEED = 3;

/** Los 4 px RGBA de la rampa. */
export function toonRampData(): Uint8Array {
  return new Uint8Array(TOON_BANDS.flatMap((v) => [v, v, v, 255]));
}

export function toonRamp(): DataTexture {
  const t = new DataTexture(toonRampData(), TOON_BANDS.length, 1, RGBAFormat);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * Pincelada: fondo 242 y 900 manchas elípticas de 205 a 254 al 55 %, que se envuelven en los bordes (la textura se
 * repite sin costura). Un valor por píxel, siempre entre 205 y 255. Determinística con la misma semilla.
 */
export function brushPixels(seed = BRUSH_SEED): Uint8Array {
  const S = BRUSH_SIZE;
  const px = new Float32Array(S * S).fill(242);
  const r = rng(seed);
  for (let i = 0; i < 900; i++) {
    const v = BRUSH_MIN + Math.floor(r() * 50);
    const cx = Math.floor(r() * S);
    const cy = Math.floor(r() * S);
    const ang = -0.6 + r() * 0.3;
    const a = 4 + r() * 9;
    const b = 1.5 + r() * 2.5;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const reach = Math.ceil(a);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const u = (dx * ca + dy * sa) / a;
        const w = (-dx * sa + dy * ca) / b;
        if (u * u + w * w > 1) continue;
        const k = (((cy + dy) % S) + S) % S * S + ((((cx + dx) % S) + S) % S);
        px[k] = (px[k] as number) * 0.45 + v * 0.55;
      }
    }
  }
  const out = new Uint8Array(S * S);
  for (let k = 0; k < S * S; k++) out[k] = Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, Math.round(px[k] as number)));
  return out;
}

export function brushTexture(seed = BRUSH_SEED): DataTexture {
  const gray = brushPixels(seed);
  const rgba = new Uint8Array(gray.length * 4);
  gray.forEach((v, i) => rgba.set([v, v, v, 255], i * 4));
  const t = new DataTexture(rgba, BRUSH_SIZE, BRUSH_SIZE, RGBAFormat);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(BRUSH_REPEAT, BRUSH_REPEAT);
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
