// Grilla de caminabilidad (03 §2.4 #1): celdas de 0,5 m en el plano XZ sobre tiles de 1 m. Fuera de la
// grilla todo es bloqueado. TS puro y determinístico: la misma entrada da la misma grilla.

/** Lado de una celda de caminabilidad, en metros (03 §2.4: 0,5 m sobre tiles de 1 m). */
export const CELL_SIZE = 0.5;

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WalkGrid {
  /** Esquina (minX, minZ) de la celda [0, 0]. */
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  cellSize: number;
  /** 1 = caminable, 0 = bloqueada; fila mayor: walkable[row * cols + col]. */
  walkable: Uint8Array;
}

/** Una celda como [columna (x), fila (z)]. */
export type Cell = readonly [number, number];

export interface Point {
  x: number;
  z: number;
}

/** Rectángulo alineado a los ejes (huella de un volumen). */
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

/** Celda que contiene el punto (puede quedar fuera de la grilla). */
export const cellAt = (g: WalkGrid, x: number, z: number): Cell => [
  Math.floor((x - g.originX) / g.cellSize),
  Math.floor((z - g.originZ) / g.cellSize),
];

export const cellCenter = (g: WalkGrid, col: number, row: number): Point => ({
  x: g.originX + (col + 0.5) * g.cellSize,
  z: g.originZ + (row + 0.5) * g.cellSize,
});

/** Punto en polígono (regla par-impar); los vértices van como [x, z]. */
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
  /** Polígonos no caminables (agua, bordes): bloquean las celdas cuyo centro cae adentro. */
  polygons?: readonly (readonly (readonly [number, number])[])[];
  /** Huellas de volúmenes: bloquean toda celda que se superpone con área positiva. */
  rects?: readonly Rect[];
}

/** Arma la grilla de un diorama (en build o al cargar). */
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
      g.walkable[row * cols + col] = inPolygon || inRect ? 0 : 1;
    }
  }
  return g;
}

/** Grilla desde un dibujo ASCII ('#' bloqueada, cualquier otro caracter caminable). Para tests y fixtures. */
export function gridFromRows(rows: readonly string[], cellSize = CELL_SIZE, originX = 0, originZ = 0): WalkGrid {
  const cols = rows[0]?.length ?? 0;
  const walkable = new Uint8Array(cols * rows.length);
  rows.forEach((line, row) => {
    for (let col = 0; col < cols; col++) walkable[row * cols + col] = line[col] === "#" ? 0 : 1;
  });
  return { originX, originZ, cols, rows: rows.length, cellSize, walkable };
}

/**
 * La celda caminable más cercana a `cell` (anillos crecientes, desempate por orden fijo), hasta `maxRadius`
 * celdas. Sirve para un clic sobre un obstáculo: se camina hasta el borde. null si no hay ninguna.
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
