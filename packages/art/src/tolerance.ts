// @lg/art tolerance.ts: the color range that `paintColors` can give for a token (plan estetica-c M2): used to
// check that a glTF repainted by scripts/assets/optimize.ts stayed within the tokens assigned to it, with
// the 8-bit quantization error included.
import { PAINT_DEFAULTS, type PaintOptions, type Rgb } from "./paint.ts";

/** Error of quantizing a normalized color to 8 bits (plus a numeric margin). */
export const COLOR_QUANT_EPS = 1 / 255 + 1e-4;

/** Minimum and maximum per channel that `paintColors(…, rgb, …, opts)` can write. */
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

/** Does the color fall within what the paint can give for that token? */
export function withinPaint(color: ArrayLike<number>, rgb: Rgb, opts: PaintOptions = {}, eps = COLOR_QUANT_EPS): boolean {
  const { min, max } = paintRange(rgb, opts, eps);
  for (let k = 0; k < 3; k++) {
    const c = color[k] as number;
    if (c < (min[k] as number) || c > (max[k] as number)) return false;
  }
  return true;
}
