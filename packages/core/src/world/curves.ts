// Curvas del layout de diorama (plan estetica-c M5, propuesta C §2): caminos y ríos se escriben como curvas catmull-rom
// por sus puntos de control. El núcleo las muestrea UNA vez al cargar el diorama y deja la polilínea en el runtime: la
// grilla (ríos que bloquean) y world/ (terreno que se aplana o se hunde, color del camino) leen la misma línea.
import type { Point } from "../movement";

type Vec2 = readonly [number, number];

/** Muestras por tramo entre dos puntos de control. */
export const CURVE_SAMPLES_PER_SPAN = 8;

/**
 * Catmull-rom uniforme que pasa por todos los puntos de control (los extremos se repiten como tangente). Dos puntos dan
 * el segmento recto; puntos alineados dan una recta.
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
