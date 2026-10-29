// world/sky/palette.ts: la niebla que sigue al zoom (open-world-3d T5/T6, AC40) y el plano lejano de la cámara. Desde
// T7b (D-838, D-839) los colores del cielo y de la niebla y el rango de la niebla son del look (`WorldLook.sky` y
// `WorldLook.fog` de @lg/art); acá queda solo la cuenta, una sola para todo diorama (la `fogFor` de distancia de
// lighting/params.ts, la de D-208 que ya nadie llamaba desde T5, se fundió en esta).
import type { FogRange } from "@lg/art";

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Plano lejano de la cámara del zoom continuo en t = 0 y t = 1 (world/camera/zoom.ts lo usa). Núcleo, no look. */
export const FAR_RANGE = [700, 2200] as const;

/**
 * Niebla del rango del look para la escala del tier (`fogScale` de la densidad: 0,85 / 1 / 1,15 en el mundo abierto) y
 * el t de zoom (AC40): crece con smoothstep(0,3, 0,95, t) de `near` a `far` del rango, toda escalada por el tier, así
 * `low` tiene la niebla más corta en todo t. Con DEFAULT_LOOK, de 45-250 m a 520-1.500 m; el lejano (1.725 m en
 * `high`) nunca pasa el plano lejano (2.200 m): un test lo exige para cada look del catálogo.
 */
export function fogFor(range: FogRange, scale: number, t: number): { near: number; far: number } {
  const sT = smooth(0.3, 0.95, clamp01(t));
  return { near: lerp(range.near[0], range.near[1], sT) * scale, far: lerp(range.far[0], range.far[1], sT) * scale };
}

/** Plano lejano (m) para un t de zoom. */
export function farPlaneFor(t: number): number {
  return Math.round(lerp(FAR_RANGE[0], FAR_RANGE[1], smooth(0.3, 0.95, clamp01(t))));
}
