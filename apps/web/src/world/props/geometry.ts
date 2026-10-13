// world/props/geometry.ts — piezas redondeadas por código (propuesta C §7: ningún volumen con aristas de 90° sin
// bisel) y la fusión de piezas pintadas en una sola malla. Todo con imports por nombre de three y three/addons (cero
// dependencias nuevas). Cada pieza se pinta por vértice antes de fusionarse: fusionar no pierde colores.
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

/** Une piezas (ya pintadas) en una geometría no indexada con position, normal, uv y color. */
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

/** Pinta una pieza y la devuelve (para encadenar con mergeParts). */
export const painted = (g: BufferGeometry, paint: Paint, seed = 0, opts: PaintOptions = {}): BufferGeometry => paintGeometry(g, paint, seed, opts);

/** Caja biselada con la base en y = 0 y centrada en x, z. */
export function roundedBox(w: number, h: number, d: number, radius: number, segments = 2): BufferGeometry {
  const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  return new RoundedBoxGeometry(w, h, d, segments, r).translate(0, h / 2, 0);
}

/** Cápsula vertical (largo total `length`) con la base en y = 0. */
export function capsule(radius: number, length: number, radial = 8): BufferGeometry {
  const body = Math.max(0.001, length - 2 * radius);
  return new CapsuleGeometry(radius, body, 3, radial, 1).translate(0, length / 2, 0);
}

/** Cápsula horizontal a lo largo de x, centrada en el origen. */
export function capsuleX(radius: number, length: number, radial = 6): BufferGeometry {
  return new CapsuleGeometry(radius, Math.max(0.001, length - 2 * radius), 3, radial, 1).rotateZ(Math.PI / 2);
}

export const sphere = (radius: number, w = 14, h = 10): BufferGeometry => new SphereGeometry(radius, w, h);
export const blob = (radius: number, detail = 1): BufferGeometry => new IcosahedronGeometry(radius, detail);
export const torus = (radius: number, tube: number, radial = 6, tubular = 16): BufferGeometry => new TorusGeometry(radius, tube, radial, tubular);

/** Sólido de revolución desde un perfil (r, y) de abajo hacia arriba. */
export const lathe = (profile: readonly (readonly [number, number])[], segments = 9): BufferGeometry =>
  new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);

/**
 * Polígono con todas las esquinas redondeadas (curva cuadrática con control en la esquina, tangente a los dos lados).
 * Los puntos van en orden antihorario.
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

/** Extrusión biselada de un perfil (en el plano x/y) a lo largo de z, centrada en z = 0. */
export function extrudeRounded(shape: Shape, depth: number, bevel = 0.12): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 5 });
  return g.translate(0, 0, -depth / 2);
}
