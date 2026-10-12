// world/terrain/color.ts — operaciones chicas sobre colores lineales (puras).
import type { Rgb } from "../materials/paint";

export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleRgb = (a: Rgb, k: number): Rgb => [Math.min(1, a[0] * k), Math.min(1, a[1] * k), Math.min(1, a[2] * k)];
