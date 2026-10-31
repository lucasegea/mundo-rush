// @lg/art shapes.ts: 2D queries on the layout shapes (water polygons, path and river polylines) to
// paint and model the terrain (plan estetica-c M5). world/ uses the core only as types, so the ground painting
// cannot call the core's grid; these are its own queries, pure and without three. The walkability grid
// is still the core's (packages/core/src/movement/grid.ts) and a test compares both over the water.

export interface XZ {
  x: number;
  z: number;
}

/** Point in polygon (even-odd rule); vertices as [x, z]. */
export function insidePolygon(x: number, z: number, polygon: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i] as readonly [number, number];
    const [xj, zj] = polygon[j] as readonly [number, number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const segmentDistance = (x: number, z: number, ax: number, az: number, bx: number, bz: number): number => {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
};

/** Distance from (x, z) to a polyline (Infinity if it is empty). */
export function polylineDistance(x: number, z: number, line: readonly XZ[]): number {
  if (line.length === 1) return Math.hypot(x - (line[0] as XZ).x, z - (line[0] as XZ).z);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as XZ;
    const b = line[i] as XZ;
    best = Math.min(best, segmentDistance(x, z, a.x, a.z, b.x, b.z));
  }
  return best;
}

/** Distance from (x, z) to the edge of a polygon (unsigned). */
export function polygonEdgeDistance(x: number, z: number, polygon: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j] as readonly [number, number];
    const b = polygon[i] as readonly [number, number];
    best = Math.min(best, segmentDistance(x, z, a[0], a[1], b[0], b[1]));
  }
  return best;
}

/**
 * The point of a polyline nearest to (x, z) and its distance (open-world-3d T6: the path flattens its section with the
 * height of its center). null if the polyline is empty.
 */
export function polylineNearest(x: number, z: number, line: readonly XZ[]): { x: number; z: number; d: number } | null {
  if (line.length === 0) return null;
  if (line.length === 1) {
    const p = line[0] as XZ;
    return { x: p.x, z: p.z, d: Math.hypot(x - p.x, z - p.z) };
  }
  let best: { x: number; z: number; d: number } = { x: 0, z: 0, d: Infinity };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as XZ;
    const b = line[i] as XZ;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const qx = a.x + t * dx;
    const qz = a.z + t * dz;
    const d = Math.hypot(x - qx, z - qz);
    if (d < best.d) best = { x: qx, z: qz, d };
  }
  return best;
}
