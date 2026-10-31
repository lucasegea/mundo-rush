// Walkability grid (03 §2.4 #1): 0.5 m cells in the XZ plane over 1 m tiles. Outside the
// grid everything is blocked. Pure and deterministic TS: the same input gives the same grid.

/** Side of a walkability cell, in meters (03 §2.4: 0.5 m over 1 m tiles). */
export const CELL_SIZE = 0.5;

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WalkGrid {
  /** Corner (minX, minZ) of cell [0, 0]. */
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  cellSize: number;
  /** 1 = caminable, 0 = bloqueada; fila mayor: walkable[row * cols + col]. */
  walkable: Uint8Array;
}

/** A cell as [column (x), row (z)]. */
export type Cell = readonly [number, number];

export interface Point {
  x: number;
  z: number;
}

/** Axis-aligned rectangle (footprint of a volume). */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const inBounds = (g: WalkGrid, col: number, row: number): boolean =>
  col >= 0 && row >= 0 && col < g.cols && row < g.rows;

export const isWalkable = (g: WalkGrid, col: number, row: number): boolean =>
  inBounds(g, col, row) && g.walkable[row * g.cols + col] === 1;

/** Cell that contains the point (may fall outside the grid). */
export const cellAt = (g: WalkGrid, x: number, z: number): Cell => [
  Math.floor((x - g.originX) / g.cellSize),
  Math.floor((z - g.originZ) / g.cellSize),
];

export const cellCenter = (g: WalkGrid, col: number, row: number): Point => ({
  x: g.originX + (col + 0.5) * g.cellSize,
  z: g.originZ + (row + 0.5) * g.cellSize,
});

/** Point in polygon (even-odd rule); vertices are given as [x, z]. */
export function pointInPolygon(x: number, z: number, polygon: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i] as readonly [number, number];
    const [xj, zj] = polygon[j] as readonly [number, number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface WalkGridSpec {
  bounds: Bounds;
  /** Non-walkable polygons (water, edges): they block the cells whose center falls inside. */
  polygons?: readonly (readonly (readonly [number, number])[])[];
  /** Volume footprints: they block every cell that overlaps with positive area. */
  rects?: readonly Rect[];
  /**
   * Strips along a polyline (rivers, plan estetica-c M5): they block the cells whose center is less than
   * `halfWidth` from the line.
   */
  bands?: readonly { line: readonly Point[]; halfWidth: number }[];
}

/** Distance from (x, z) to a polyline (to its single point if it has one; Infinity if it is empty). */
export function distanceToPolyline(x: number, z: number, line: readonly Point[]): number {
  if (line.length === 1) {
    const p = line[0] as Point;
    return Math.hypot(x - p.x, z - p.z);
  }
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Point;
    const b = line[i] as Point;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)));
  }
  return best;
}

/** Builds a diorama's grid (at build time or on load). */
export function buildWalkGrid(spec: WalkGridSpec, cellSize = CELL_SIZE): WalkGrid {
  const { bounds } = spec;
  const cols = Math.max(0, Math.round((bounds.maxX - bounds.minX) / cellSize));
  const rows = Math.max(0, Math.round((bounds.maxZ - bounds.minZ) / cellSize));
  const g: WalkGrid = { originX: bounds.minX, originZ: bounds.minZ, cols, rows, cellSize, walkable: new Uint8Array(cols * rows) };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = g.originX + col * cellSize;
      const z0 = g.originZ + row * cellSize;
      const { x, z } = cellCenter(g, col, row);
      const inPolygon = (spec.polygons ?? []).some((p) => pointInPolygon(x, z, p));
      const inRect = (spec.rects ?? []).some((r) => r.minX < x0 + cellSize && r.maxX > x0 && r.minZ < z0 + cellSize && r.maxZ > z0);
      const inBand = (spec.bands ?? []).some((b) => distanceToPolyline(x, z, b.line) < b.halfWidth);
      g.walkable[row * cols + col] = inPolygon || inRect || inBand ? 0 : 1;
    }
  }
  return g;
}

/** Grid from an ASCII drawing ('#' blocked, any other character walkable). For tests and fixtures. */
export function gridFromRows(rows: readonly string[], cellSize = CELL_SIZE, originX = 0, originZ = 0): WalkGrid {
  const cols = rows[0]?.length ?? 0;
  const walkable = new Uint8Array(cols * rows.length);
  rows.forEach((line, row) => {
    for (let col = 0; col < cols; col++) walkable[row * cols + col] = line[col] === "#" ? 0 : 1;
  });
  return { originX, originZ, cols, rows: rows.length, cellSize, walkable };
}

/**
 * The walkable cell nearest to `cell` (growing rings, tie-break in fixed order), up to `maxRadius`
 * cells. Used for a click on an obstacle: you walk to the edge. null if there is none.
 */
export function nearestWalkable(g: WalkGrid, cell: Cell, maxRadius = 3): Cell | null {
  const [c0, r0] = cell;
  if (isWalkable(g, c0, r0)) return cell;
  for (let radius = 1; radius <= maxRadius; radius++) {
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        const d = dc * dc + dr * dr;
        if (isWalkable(g, c, r) && d < bestD) {
          best = [c, r];
          bestD = d;
        }
      }
    }
    if (best) return best;
  }
  return null;
}
