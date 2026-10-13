// @lg/art tolerance.ts: el rango de color que puede dar `paintColors` para un token (plan estetica-c M2): sirve para
// comprobar que un glTF repintado por scripts/assets/optimize.ts quedó dentro de los tokens que se le asignaron, con
// el error de la cuantización a 8 bits incluido.
import { PAINT_DEFAULTS, type PaintOptions, type Rgb } from "./paint.ts";

/** Error de cuantizar un color normalizado a 8 bits (más un margen numérico). */
export const COLOR_QUANT_EPS = 1 / 255 + 1e-4;

/** Mínimo y máximo por canal que `paintColors(…, rgb, …, opts)` puede escribir. */
export function paintRange(rgb: Rgb, opts: PaintOptions = {}, eps = COLOR_QUANT_EPS): { min: Rgb; max: Rgb } {
  const top = opts.top ?? PAINT_DEFAULTS.top;
  const bottomDark = opts.bottomDark ?? PAINT_DEFAULTS.bottomDark;
  const half = (opts.jitter ?? PAINT_DEFAULTS.jitter) / 2;
  const up = Math.min(1, top * 4);
  const light = (k: number): number => (opts.light ? (opts.light[k] as number) : (rgb[k] as number) + (1 - (rgb[k] as number)) * 0.18);
  const lo = (k: number): number => Math.max(0, Math.min(rgb[k] as number, light(k)) * (1 - bottomDark) - half - eps);
  const hi = (k: number): number => {
    const base = rgb[k] as number;
    return Math.min(1, Math.max(base, base + (light(k) - base) * up) + half + eps);
  };
  return { min: [lo(0), lo(1), lo(2)], max: [hi(0), hi(1), hi(2)] };
}

/** ¿El color cae dentro de lo que la pintura puede dar para ese token? */
export function withinPaint(color: ArrayLike<number>, rgb: Rgb, opts: PaintOptions = {}, eps = COLOR_QUANT_EPS): boolean {
  const { min, max } = paintRange(rgb, opts, eps);
  for (let k = 0; k < 3; k++) {
    const c = color[k] as number;
    if (c < (min[k] as number) || c > (max[k] as number)) return false;
  }
  return true;
}
