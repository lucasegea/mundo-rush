// Colisión círculo vs. celdas bloqueadas (03 §2.4 #4). Sin física: el personaje es un círculo en XZ y se
// desliza sobre los bordes. Movimiento por sub-pasos y por eje, con búsqueda binaria hasta el contacto, así
// nunca atraviesa una esquina ni pasa entre dos celdas bloqueadas que se tocan en diagonal.
import { isWalkable, type Point, type WalkGrid } from "./grid";

/** ¿El círculo (x, z, r) se superpone con alguna celda bloqueada (o con el afuera de la grilla)? */
export function circleBlocked(g: WalkGrid, x: number, z: number, r: number): boolean {
  const s = g.cellSize;
  const c0 = Math.floor((x - r - g.originX) / s);
  const c1 = Math.floor((x + r - g.originX) / s);
  const r0 = Math.floor((z - r - g.originZ) / s);
  const r1 = Math.floor((z + r - g.originZ) / s);
  const r2 = r * r;
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (isWalkable(g, col, row)) continue;
      const minX = g.originX + col * s;
      const minZ = g.originZ + row * s;
      const dx = x - Math.max(minX, Math.min(x, minX + s));
      const dz = z - Math.max(minZ, Math.min(z, minZ + s));
      // Estricto: tocar el borde no es chocar (así se puede deslizar pegado a una pared).
      if (dx * dx + dz * dz < r2 - 1e-9) return true;
    }
  }
  return false;
}

const CONTACT_ITERATIONS = 8;

/** Avanza `delta` sobre un eje; si choca, se queda en el último punto libre (búsqueda binaria). */
function moveAxis(g: WalkGrid, p: Point, delta: number, axis: "x" | "z", r: number): Point {
  if (delta === 0) return p;
  const at = (t: number): Point => (axis === "x" ? { x: p.x + delta * t, z: p.z } : { x: p.x, z: p.z + delta * t });
  const full = at(1);
  if (!circleBlocked(g, full.x, full.z, r)) return full;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < CONTACT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const q = at(mid);
    if (circleBlocked(g, q.x, q.z, r)) hi = mid;
    else lo = mid;
  }
  return at(lo);
}

/**
 * Mueve el círculo `(dx, dz)` con deslizamiento. Sub-pasos de a lo sumo r/2 para no saltear celdas.
 * Si el punto de partida ya está bloqueado (dato malo), no se mueve.
 */
export function moveCircle(g: WalkGrid, from: Point, dx: number, dz: number, r: number): Point {
  if (circleBlocked(g, from.x, from.z, r)) return from;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.max(r / 2, 1e-3)));
  let p = from;
  for (let i = 0; i < steps; i++) {
    p = moveAxis(g, p, dx / steps, "x", r);
    p = moveAxis(g, p, dz / steps, "z", r);
  }
  return p;
}

/** ¿El segmento a→b se puede recorrer con un círculo de radio r sin chocar? (muestreo cada r/2) */
export function segmentClear(g: WalkGrid, a: Point, b: Point, r: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / Math.max(r / 2, 0.05)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (circleBlocked(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, r)) return false;
  }
  return true;
}
