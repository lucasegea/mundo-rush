// Diorama layout curves (plan estetica-c M5, proposal C §2): paths and rivers are written as catmull-rom curves
// through their control points. The core samples them ONCE when loading the diorama and leaves the polyline in the runtime: the
// grid (rivers that block) and world/ (terrain that flattens or sinks, path color) read the same line.
import type { Point } from "../movement";

type Vec2 = readonly [number, number];

/** Samples per segment between two control points. */
export const CURVE_SAMPLES_PER_SPAN = 8;

/**
 * Uniform catmull-rom that passes through all the control points (the ends are repeated as tangent). Two points give
 * the straight segment; collinear points give a straight line.
 */
export function sampleCatmullRom(points: readonly Vec2[], samplesPerSpan = CURVE_SAMPLES_PER_SPAN): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ x: (points[0] as Vec2)[0], z: (points[0] as Vec2)[1] }];
  const at = (i: number): Vec2 => points[Math.max(0, Math.min(points.length - 1, i))] as Vec2;
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < samplesPerSpan; s++) {
      const t = s / samplesPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const last = points[points.length - 1] as Vec2;
  out.push({ x: last[0], z: last[1] });
  return out;
}
