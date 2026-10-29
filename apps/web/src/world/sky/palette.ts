// world/sky/palette.ts: el único módulo de colores del cielo del mundo abierto (open-world-3d T6, D-823, AC38) y la
// niebla que sigue al zoom (AC40). La cúpula pinta cénit, bruma y horizonte; el horizonte ES el token de la niebla (y el
// fondo), así el borde lejano del terreno se funde con el cielo sin costura. Los hex viven en @lg/art (palette.ts).
import { PALETTE, type PaletteToken } from "@lg/art";

/** Los tres colores de la cúpula (de arriba abajo) por token de la paleta. */
export const SKY_TOKENS = { zenith: "cielo-cenit", haze: "cielo-medio", horizon: "cielo-horizonte" } as const satisfies Record<string, PaletteToken>;
export const SKY_PALETTE = {
  zenith: PALETTE[SKY_TOKENS.zenith],
  haze: PALETTE[SKY_TOKENS.haze],
  horizon: PALETTE[SKY_TOKENS.horizon],
} as const;

/** El token de la niebla del mundo abierto: el horizonte de la cúpula, exactamente (AC38). */
export const OPEN_FOG_COLOR = SKY_PALETTE.horizon;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** La niebla de cerca (t = 0) y del mapa entero (t = 1) del mockup V6 (`world.js` applyView), antes de la escala del tier. */
export const FOG_RANGE = { near: [45, 520], far: [250, 1500] } as const;
/** Plano lejano de la cámara del zoom continuo en t = 0 y t = 1 (world/camera/zoom.ts lo usa). */
export const FAR_RANGE = [700, 2200] as const;

/**
 * Niebla para la escala del tier (`fogScale` de OPEN_WORLD_DENSITY: 0,85 / 1 / 1,15) y el t de zoom (AC40): crece con
 * smoothstep(0,3, 0,95, t) de 45-250 m a 520-1.500 m, toda escalada por el tier, así `low` tiene la niebla más corta en
 * todo t y el lejano (1.725 m en `high`) nunca pasa el plano lejano (2.200 m).
 */
export function fogFor(scale: number, t: number): { near: number; far: number } {
  const sT = smooth(0.3, 0.95, clamp01(t));
  return { near: lerp(FOG_RANGE.near[0], FOG_RANGE.near[1], sT) * scale, far: lerp(FOG_RANGE.far[0], FOG_RANGE.far[1], sT) * scale };
}

/** Plano lejano (m) para un t de zoom. */
export function farPlaneFor(t: number): number {
  return Math.round(lerp(FAR_RANGE[0], FAR_RANGE[1], smooth(0.3, 0.95, clamp01(t))));
}
