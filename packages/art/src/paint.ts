// @lg/art paint.ts: the "painted" per-vertex color of proposal C §7, without three (plan estetica-c M1 item 7,
// architecture review 2026-10-12): pure core over arrays, moved from world/materials/ in M2 as is. Used by the
// world/materials/paintGeometry.ts adapter and scripts/assets/optimize.ts (a single implementation). Vertical gradient (lighter
// at the top, 15 to 35 % darker at the bottom) and brush jitter by position. Colors are in linear space (the one
// three uses in color attributes).
import { PALETTE, type PaletteToken } from "./palette.ts";

export type Rgb = readonly [number, number, number];

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** #rrggbb → linear color (the same as three's `new Color(hex)` with the active color management). */
export function hexToLinear(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

/** A palette token or a loose hex, in linear. */
export const tokenRgb = (token: PaletteToken | `#${string}`): Rgb =>
  hexToLinear(token.startsWith("#") ? token : PALETTE[token as PaletteToken]);

/** Deterministic hash of a position and a seed → [0, 1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h = Math.imul(Math.round(x * 997) | 0, 374761393) ^ Math.imul(Math.round(y * 991) | 0, 668265263) ^ Math.imul(Math.round(z * 983) | 0, 1440662683);
  h = Math.imul(h ^ seed ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise (bilinear with smoothstep over a hash), deterministic. → [0, 1). */
export function noise2(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash3(xi, 0, zi, seed);
  const b = hash3(xi + 1, 0, zi, seed);
  const c = hash3(xi, 0, zi + 1, seed);
  const d = hash3(xi + 1, 0, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export interface PaintOptions {
  /** How much it lightens toward the top (0 to 1; the mockup uses 0.05 to 0.3). */
  top?: number;
  /** How much darker it ends up at the bottom (proposal C §7: 0.15 to 0.35). */
  bottomDark?: number;
  /** Total amplitude of the brush jitter in luminance (proposal C §7: 0.07). */
  jitter?: number;
  /** Top color; otherwise, the lightened base. */
  light?: Rgb;
}

export const PAINT_DEFAULTS = { top: 0.18, bottomDark: 0.15, jitter: 0.07 } as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lighter = (c: Rgb): Rgb => [c[0] + (1 - c[0]) * 0.18, c[1] + (1 - c[1]) * 0.18, c[2] + (1 - c[2]) * 0.18];

/**
 * Per-vertex colors for `positions` (x, y, z interleaved): vertical gradient between the minimum and maximum y and brush
 * jitter by position. Deterministic with the same seed. Returns r, g, b interleaved.
 */
export function paintColors(positions: ArrayLike<number>, rgb: Rgb, seed = 0, opts: PaintOptions = {}): Float32Array {
  const top = opts.top ?? PAINT_DEFAULTS.top;
  const bottomDark = opts.bottomDark ?? PAINT_DEFAULTS.bottomDark;
  const jitter = opts.jitter ?? PAINT_DEFAULTS.jitter;
  const hi = opts.light ?? lighter(rgb);
  const n = Math.floor(positions.length / 3);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1] as number;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const span = Math.max(1e-6, y1 - y0);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3] as number;
    const y = positions[i * 3 + 1] as number;
    const z = positions[i * 3 + 2] as number;
    const t = (y - y0) / span;
    const up = Math.min(1, t * top * 4);
    const shade = 1 - bottomDark * (1 - t);
    const j = (hash3(x * 13.1, y * 3.3, z * 7.7, seed) - 0.5) * jitter;
    for (let k = 0; k < 3; k++) {
      const base = rgb[k] as number;
      out[i * 3 + k] = clamp01((base + ((hi[k] as number) - base) * up) * shade + j);
    }
  }
  return out;
}
