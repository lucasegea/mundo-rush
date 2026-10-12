// world/terrain/buildTerrain.ts — terreno por alturas de la propuesta C (plan estetica-c M1 ítem 8), puro y sin three:
// una malla de alturas continua (una sola grilla indexada: sin vértices duplicados) con color por vértice derivado del
// layout de tiles actual, sin cambiar su forma. Adaptador tile → pintura: 1 pasto, 2 pasto-luz, 3 camino con borde
// ruidoso de tierra, 4 agua (el terreno se hunde y lleva orilla), 5 empedrado. Dentro de los límites caminables el
// suelo es plano en y = 0 (el raycast del suelo sigue siendo el plano invisible); afuera sube en lomas de hasta ~5,5 m,
// lo bastante lejos como para que ninguna cámara de juego vea el borde (A2). Determinístico con la misma semilla.
import type { Bounds, TileLayerData } from "@lg/core";
import { mixRgb, scaleRgb } from "./color";
import { noise2, tokenRgb, type Rgb } from "../materials/paint";
import { rng } from "../materials/rng";

/** Metros de terreno más allá de los límites caminables, de cada lado (cubre el frustum en 21:9 al zoom más lejano). */
export const TERRAIN_SKIRT = 48;
/** Separación de vértices cerca y dentro de los límites (la mitad de un tile). */
export const FINE_STEP = 0.5;
const FINE_MARGIN = 0.5;
export const HILL_MAX = 5.5;
const HILL_RAMP = 16;
export const TERRAIN_SEED = 11;

export const TILE = { pasto: 1, pastoLuz: 2, camino: 3, agua: 4, empedrado: 5 } as const;
export const DETAIL = { flores: 6, matas: 7, piedritas: 8 } as const;

export interface TerrainSpec {
  bounds: Bounds;
  layers: readonly TileLayerData[];
  seed?: number;
}

export interface Terrain {
  /** Líneas de la grilla en x y en z (crecientes). */
  xs: Float64Array;
  zs: Float64Array;
  /** x, y, z intercalados; vértice (i, j) = j * xs.length + i. */
  positions: Float32Array;
  /** r, g, b lineales intercalados. */
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  extent: Bounds;
  /** Altura del terreno (bilineal sobre la malla). */
  heightAt(x: number, z: number): number;
  /** Índice del vértice que está exactamente en (x, z), o -1. */
  vertexAt(x: number, z: number): number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Id del tile de la capa en (x, z) (0 fuera de la capa o sin capa). */
export function tileAt(layer: TileLayerData | undefined, x: number, z: number): number {
  if (!layer) return 0;
  const col = Math.floor(x - layer.originX);
  const row = Math.floor(z - layer.originZ);
  if (col < 0 || row < 0 || col >= layer.width || row >= layer.height) return 0;
  return layer.tiles[row * layer.width + col] ?? 0;
}

/** Distancia de (x, z) al tile más cercano con ese id, buscando hasta `maxR` m (Infinity si no hay). */
export function distToTile(layer: TileLayerData | undefined, x: number, z: number, id: number, maxR: number): number {
  if (!layer) return Infinity;
  let best = Infinity;
  const c0 = Math.floor(x - layer.originX - maxR);
  const c1 = Math.floor(x - layer.originX + maxR);
  const r0 = Math.floor(z - layer.originZ - maxR);
  const r1 = Math.floor(z - layer.originZ + maxR);
  for (let row = Math.max(0, r0); row <= Math.min(layer.height - 1, r1); row++) {
    for (let col = Math.max(0, c0); col <= Math.min(layer.width - 1, c1); col++) {
      if (layer.tiles[row * layer.width + col] !== id) continue;
      const minX = layer.originX + col;
      const minZ = layer.originZ + row;
      const dx = Math.max(minX - x, 0, x - (minX + 1));
      const dz = Math.max(minZ - z, 0, z - (minZ + 1));
      best = Math.min(best, Math.hypot(dx, dz));
    }
  }
  return best <= maxR ? best : Infinity;
}

/** Distancia de (x, z) a los límites (0 adentro). */
export function outsideDistance(b: Bounds, x: number, z: number): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** Líneas de grilla: finas (0,5 m) entre fineMin y fineMax, y cada vez más gruesas hacia min y max. */
function gridLines(min: number, max: number, fineMin: number, fineMax: number): Float64Array {
  const fine: number[] = [];
  for (let v = fineMin; v <= fineMax + 1e-9; v += FINE_STEP) fine.push(Math.round(v * 2) / 2);
  const grow = (from: number, to: number, dir: 1 | -1): number[] => {
    const out: number[] = [];
    let v = from;
    let step = 2;
    while (dir > 0 ? v < to - 1e-9 : v > to + 1e-9) {
      v = dir > 0 ? Math.min(to, v + step) : Math.max(to, v - step);
      out.push(v);
      step = Math.min(8, step + 1);
    }
    return out;
  };
  const left = grow(fine[0] as number, min, -1).reverse();
  const right = grow(fine[fine.length - 1] as number, max, 1);
  return Float64Array.from([...left, ...fine, ...right]);
}

/** Índice de la celda [lines[k], lines[k+1]] que contiene v (acotado). */
function lineCell(lines: Float64Array, v: number): number {
  let lo = 0;
  let hi = lines.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((lines[mid] as number) <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function groundHeight(spec: TerrainSpec, suelo: TileLayerData | undefined, x: number, z: number, seed: number): number {
  const out = outsideDistance(spec.bounds, x, z);
  if (out > 0) {
    // Lomas: suben suave desde el borde de los límites, con variación de altura por ruido.
    const hill = smooth(0, HILL_RAMP, out) * (HILL_MAX - 0.25) * (0.55 + 0.45 * noise2(x * 0.05 + 9, z * 0.05, seed));
    const wobble = (noise2(x * 0.21 + 5, z * 0.21, seed) - 0.5) * 0.5 * smooth(0, 4, out);
    return Math.min(HILL_MAX, hill + wobble);
  }
  // Agua: se hunde solo un vértice estrictamente adentro (los cuatro cuadrantes son agua), así el centro de una celda
  // caminable vecina sigue en 0 y el de una celda de agua queda por debajo.
  const e = 1e-3;
  const water = [[-e, -e], [e, -e], [-e, e], [e, e]].every(([dx, dz]) => tileAt(suelo, x + (dx as number), z + (dz as number)) === TILE.agua);
  if (!water) return 0;
  let edge = Infinity;
  for (let r = 0.25; r <= 1.5 && edge === Infinity; r += 0.25) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (tileAt(suelo, x + Math.cos(a) * r, z + Math.sin(a) * r) !== TILE.agua) { edge = r; break; }
    }
  }
  return -(0.3 + 0.6 * smooth(0, 1.5, Math.min(edge, 1.5)));
}

interface Palette {
  pasto: Rgb; luz: Rgb; sombra: Rgb; camino: Rgb; borde: Rgb; orilla: Rgb; honda: Rgb; piedra: Rgb;
}

function groundColor(p: Palette, spec: TerrainSpec, suelo: TileLayerData | undefined, x: number, z: number, h: number, seed: number): Rgb {
  const n1 = noise2(x * 0.15, z * 0.15, seed);
  const n2 = noise2(x * 0.6 + 3, z * 0.6, seed);
  let c = mixRgb(mixRgb(p.pasto, p.luz, smooth(0.45, 0.8, n1) * 0.8), p.sombra, smooth(0.55, 0.9, n2) * 0.25);
  if (outsideDistance(spec.bounds, x, z) > 0) return mixRgb(c, p.luz, Math.min(0.5, Math.max(0, h / 6)));
  // Corrimiento ruidoso de la consulta del tile: los bordes entre tipos quedan pintados a mano, no en escalones.
  const jx = (noise2(x * 1.9 + 7, z * 1.9, seed) - 0.5) * 0.4;
  const jz = (noise2(x * 1.9, z * 1.9 + 7, seed) - 0.5) * 0.4;
  const id = tileAt(suelo, x + jx, z + jz);
  if (h < 0) return mixRgb(p.orilla, p.honda, smooth(-0.3, -0.9, h));
  if (id === TILE.camino) return scaleRgb(p.camino, 1 + (n2 - 0.5) * 0.06);
  if (id === TILE.empedrado) return mixRgb(p.piedra, p.borde, smooth(0.4, 0.8, n2) * 0.5);
  if (id === TILE.pastoLuz) c = mixRgb(c, p.luz, 0.7);
  const dRoad = distToTile(suelo, x + jx, z + jz, TILE.camino, 1);
  if (dRoad < 1) c = mixRgb(c, p.borde, 1 - smooth(0.1, 0.6, dRoad));
  const dWater = distToTile(suelo, x + jx, z + jz, TILE.agua, 1.2);
  if (dWater < 1.2) c = mixRgb(c, p.orilla, 1 - smooth(0.3, 1.2, dWater));
  return c;
}

export function buildTerrain(spec: TerrainSpec): Terrain {
  const seed = spec.seed ?? TERRAIN_SEED;
  const { bounds } = spec;
  const suelo = spec.layers.find((l) => l.name === "suelo") ?? spec.layers[0];
  const extent: Bounds = { minX: bounds.minX - TERRAIN_SKIRT, maxX: bounds.maxX + TERRAIN_SKIRT, minZ: bounds.minZ - TERRAIN_SKIRT, maxZ: bounds.maxZ + TERRAIN_SKIRT };
  const xs = gridLines(extent.minX, extent.maxX, Math.floor(bounds.minX - FINE_MARGIN), Math.ceil(bounds.maxX + FINE_MARGIN));
  const zs = gridLines(extent.minZ, extent.maxZ, Math.floor(bounds.minZ - FINE_MARGIN), Math.ceil(bounds.maxZ + FINE_MARGIN));
  const nx = xs.length;
  const nz = zs.length;
  const p: Palette = {
    pasto: tokenRgb("pasto"), luz: tokenRgb("pasto-luz"), sombra: tokenRgb("pasto-sombra"), camino: tokenRgb("camino"),
    borde: tokenRgb("tierra-borde"), orilla: tokenRgb("orilla"), honda: tokenRgb("agua-honda"), piedra: tokenRgb("piedra"),
  };
  const positions = new Float32Array(nx * nz * 3);
  const colors = new Float32Array(nx * nz * 3);
  const uvs = new Float32Array(nx * nz * 2);
  const heights = new Float64Array(nx * nz);
  const w = extent.maxX - extent.minX;
  const d = extent.maxZ - extent.minZ;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i] as number;
      const z = zs[j] as number;
      const k = j * nx + i;
      const h = groundHeight(spec, suelo, x, z, seed);
      heights[k] = h;
      positions.set([x, h, z], k * 3);
      colors.set(groundColor(p, spec, suelo, x, z, h, seed), k * 3);
      uvs.set([(x - extent.minX) / w, (z - extent.minZ) / d], k * 2);
    }
  }
  // Dos triángulos por celda, antihorarios vistos desde arriba (normal +y).
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const e = c + 1;
      indices.set([a, c, b, b, c, e], o);
      o += 6;
    }
  }
  const heightAt = (x: number, z: number): number => {
    const i = lineCell(xs, x);
    const j = lineCell(zs, z);
    const x0 = xs[i] as number;
    const x1 = xs[i + 1] as number;
    const z0 = zs[j] as number;
    const z1 = zs[j + 1] as number;
    const u = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    const v = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
    const h = (ii: number, jj: number) => heights[jj * nx + ii] as number;
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
  const vertexAt = (x: number, z: number): number => {
    const i = lineCell(xs, x);
    const j = lineCell(zs, z);
    for (const [ii, jj] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]] as const) {
      if (Math.abs((xs[ii] ?? NaN) - x) < 1e-9 && Math.abs((zs[jj] ?? NaN) - z) < 1e-9) return jj * nx + ii;
    }
    return -1;
  };
  return { xs, zs, positions, colors, uvs, indices, extent, heightAt, vertexAt };
}

export interface Scatter {
  x: number;
  z: number;
  rot: number;
  scale: number;
}

/** Pinos del borde: fuera de los límites (a 3 m o más), sembrados por semilla con separación mínima. */
export function borderPines(bounds: Bounds, seed = TERRAIN_SEED, count = 16): Scatter[] {
  const r = rng(seed * 31 + 7);
  const out: Scatter[] = [];
  const reach = 26;
  for (let tries = 0; out.length < count && tries < count * 80; tries++) {
    const x = bounds.minX - reach + r() * (bounds.maxX - bounds.minX + 2 * reach);
    const z = bounds.minZ - reach + r() * (bounds.maxZ - bounds.minZ + 2 * reach);
    const d = outsideDistance(bounds, x, z);
    if (d < 3 || d > reach) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 2.8)) continue;
    out.push({ x, z, rot: r() * Math.PI * 2, scale: 0.85 + r() * 0.55 });
  }
  return out;
}

/** Instancias de detalle desde las capas: flores (6), matas (7), piedritas (8) y piedras del empedrado (suelo 5). */
export function detailScatter(layers: readonly TileLayerData[], seed = TERRAIN_SEED): Record<"flores" | "matas" | "piedritas" | "empedrado", Scatter[]> {
  const r = rng(seed * 17 + 3);
  const out = { flores: [] as Scatter[], matas: [] as Scatter[], piedritas: [] as Scatter[], empedrado: [] as Scatter[] };
  const put = (list: Scatter[], tx: number, tz: number, n: number, s0: number, s1: number) => {
    for (let i = 0; i < n; i++) list.push({ x: tx + 0.15 + r() * 0.7, z: tz + 0.15 + r() * 0.7, rot: r() * Math.PI * 2, scale: s0 + r() * (s1 - s0) });
  };
  for (const layer of layers) {
    for (let row = 0; row < layer.height; row++) {
      for (let col = 0; col < layer.width; col++) {
        const id = layer.tiles[row * layer.width + col];
        const tx = layer.originX + col;
        const tz = layer.originZ + row;
        if (layer.name === "suelo") {
          if (id === TILE.empedrado) put(out.empedrado, tx, tz, 3, 0.8, 1.2);
        } else if (id === DETAIL.flores) put(out.flores, tx, tz, 2, 0.9, 1.4);
        else if (id === DETAIL.matas) put(out.matas, tx, tz, 1, 0.7, 1.1);
        else if (id === DETAIL.piedritas) put(out.piedritas, tx, tz, 2, 0.7, 1.2);
      }
    }
  }
  return out;
}
