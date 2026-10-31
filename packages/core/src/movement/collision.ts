// Circle vs. blocked cells collision (03 §2.4 #4). No physics: the character is a circle in XZ and
// slides along the edges. Movement in sub-steps and per axis, with binary search up to the contact, so
// it never goes through a corner nor between two blocked cells that touch diagonally.
import { isWalkable, type Point, type WalkGrid } from "./grid";

/** Does the circle (x, z, r) overlap any blocked cell (or the outside of the grid)? */
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
      // Strict: touching the edge is not colliding (so you can slide hugging a wall).
      if (dx * dx + dz * dz < r2 - 1e-9) return true;
    }
  }
  return false;
}

const CONTACT_ITERATIONS = 8;

/** Advances `delta` along one axis; if it collides, it stays at the last free point (binary search). */
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
 * Moves the circle `(dx, dz)` with sliding. Sub-steps of at most r/2 so as not to skip cells.
 * If the starting point is already blocked (bad data), it does not move.
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

/** Can the segment a→b be traversed with a circle of radius r without colliding? (sampled every r/2) */
export function segmentClear(g: WalkGrid, a: Point, b: Point, r: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / Math.max(r / 2, 0.05)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (circleBlocked(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, r)) return false;
  }
  return true;
}
