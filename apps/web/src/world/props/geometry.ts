// world/props/geometry.ts — code-built rounded pieces (proposal C §7: no volume with 90° edges without
// bevel) and the merge of painted pieces into a single mesh. All with named imports from three and three/addons (zero
// new dependencies). Each piece is painted per vertex before merging: merging does not lose colors.
import {
  CapsuleGeometry, ExtrudeGeometry, IcosahedronGeometry, LatheGeometry, Shape, SphereGeometry, TorusGeometry, Vector2,
  type BufferGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paintGeometry } from "../materials/paintGeometry";
import type { PaintOptions, PaletteToken } from "@lg/art";

export type Paint = PaletteToken | `#${string}`;

const KEEP = new Set(["position", "normal", "uv", "color"]);

/** Joins pieces (already painted) into a non-indexed geometry with position, normal, uv and color. */
export function mergeParts(parts: readonly BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) if (!KEEP.has(name)) n.deleteAttribute(name);
    return n;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error("mergeParts: las piezas no tienen los mismos atributos");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Paints a piece and returns it (to chain with mergeParts). */
export const painted = (g: BufferGeometry, paint: Paint, seed = 0, opts: PaintOptions = {}): BufferGeometry => paintGeometry(g, paint, seed, opts);

/** Beveled box with the base at y = 0 and centered in x, z. */
export function roundedBox(w: number, h: number, d: number, radius: number, segments = 2): BufferGeometry {
  const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  return new RoundedBoxGeometry(w, h, d, segments, r).translate(0, h / 2, 0);
}

/** Vertical capsule (total length `length`) with the base at y = 0. */
export function capsule(radius: number, length: number, radial = 8): BufferGeometry {
  const body = Math.max(0.001, length - 2 * radius);
  return new CapsuleGeometry(radius, body, 3, radial, 1).translate(0, length / 2, 0);
}

/** Horizontal capsule along x, centered at the origin. */
export function capsuleX(radius: number, length: number, radial = 6): BufferGeometry {
  return new CapsuleGeometry(radius, Math.max(0.001, length - 2 * radius), 3, radial, 1).rotateZ(Math.PI / 2);
}

export const sphere = (radius: number, w = 14, h = 10): BufferGeometry => new SphereGeometry(radius, w, h);
export const blob = (radius: number, detail = 1): BufferGeometry => new IcosahedronGeometry(radius, detail);
export const torus = (radius: number, tube: number, radial = 6, tubular = 16): BufferGeometry => new TorusGeometry(radius, tube, radial, tubular);

/** Solid of revolution from a profile (r, y) from bottom to top. */
export const lathe = (profile: readonly (readonly [number, number])[], segments = 9): BufferGeometry =>
  new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);

/**
 * Polygon with all corners rounded (quadratic curve with control at the corner, tangent to both sides).
 * Points go counterclockwise.
 */
export function roundedShape(points: readonly (readonly [number, number])[], radius: number): Shape {
  const n = points.length;
  const s = new Shape();
  const at = (i: number) => points[((i % n) + n) % n] as readonly [number, number];
  const toward = (a: readonly [number, number], b: readonly [number, number], dist: number): [number, number] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = Math.min(0.45, dist / len);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  for (let i = 0; i < n; i++) {
    const c = at(i);
    const inP = toward(c, at(i - 1), radius);
    const outP = toward(c, at(i + 1), radius);
    if (i === 0) s.moveTo(inP[0], inP[1]);
    else s.lineTo(inP[0], inP[1]);
    s.quadraticCurveTo(c[0], c[1], outP[0], outP[1]);
  }
  s.closePath();
  return s;
}

/** Beveled extrusion of a profile (in the x/y plane) along z, centered at z = 0. */
export function extrudeRounded(shape: Shape, depth: number, bevel = 0.12, bevelSegments = 3, curveSegments = 5): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments, curveSegments });
  return g.translate(0, 0, -depth / 2);
}
