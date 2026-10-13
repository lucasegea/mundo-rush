// world/terrain/buildTerrain.ts: terreno por alturas de la propuesta C (plan estetica-c M1 ítem 8 y M5), puro y sin
// three: una malla de alturas continua (una sola grilla indexada: sin vértices duplicados) con color por vértice. Lee
// dos formatos de suelo detrás de una misma interfaz (`GroundSource`):
// - "maqueta" (M5): caminos y ríos por curvas (polilíneas que el núcleo muestreó), agua por polígonos. El terreno se
//   aplana bajo los caminos (también entre las lomas de afuera), se hunde bajo el agua y lleva orilla; el camino se
//   pinta `camino` (o piedra si es empedrado) con borde ruidoso `tierra-borde`.
// - "tiles" (adaptador de M1, hasta M7): 1 pasto, 2 pasto-luz, 3 camino, 4 agua, 5 empedrado.
// Dentro de los límites caminables el suelo es plano en y = 0 (el raycast del suelo sigue siendo el plano invisible);
// afuera sube en lomas de hasta `lomas` m, lo bastante lejos como para que ninguna cámara de juego vea el borde (A2).
// Las líneas de la grilla salen de @lg/art (la misma cuenta que usa el estimador de validate:content). Determinístico
// con la misma semilla.
import type { Bounds, DioramaGround, TileLayerData, WalkGrid } from "@lg/core";
import {
  FINE_STEP as ART_FINE_STEP, HILL_MAX as ART_HILL_MAX, insidePolygon, noise2, pavingStoneCount, polygonEdgeDistance,
  polylineDistance, TERRAIN_SEED as ART_TERRAIN_SEED, TERRAIN_SKIRT as ART_TERRAIN_SKIRT, terrainExtent, terrainLines,
  tokenRgb, type PaletteToken, type Rgb, type TerrainPaletteRole,
} from "@lg/art";
import { mixRgb, scaleRgb } from "./color";
import { rng } from "../materials/rng";

/** Metros de terreno más allá de los límites caminables, de cada lado (D-208; ver @lg/art terrain.ts). */
export const TERRAIN_SKIRT = ART_TERRAIN_SKIRT;
/** Separación de vértices cerca y dentro de los límites (la mitad de un tile). */
export const FINE_STEP = ART_FINE_STEP;
export const HILL_MAX = ART_HILL_MAX;
export const TERRAIN_SEED = ART_TERRAIN_SEED;
/**
 * La textura de pincel se repite sobre las UV del terreno: su escala en metros se fija con la falda de M1 (48 m), así
 * alargar la falda no agranda la pincelada.
 */
const BRUSH_UV_SKIRT = 48;
const HILL_RAMP = 16;

export const TILE = { pasto: 1, pastoLuz: 2, camino: 3, agua: 4, empedrado: 5 } as const;
export const DETAIL = { flores: 6, matas: 7, piedritas: 8 } as const;

export interface TerrainSpec {
  bounds: Bounds;
  /** Capas de tiles (adaptador de M1); se usan si `ground` no es del formato de la maqueta. */
  layers: readonly TileLayerData[];
  /** El suelo del formato de la maqueta (plan estetica-c M5). */
  ground?: DioramaGround;
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

/** Lo que el terreno pregunta del suelo, sea de tiles o de curvas. */
export interface GroundSource {
  /** Superficie en (x, z): camino, empedrado, pasto-luz (solo tiles) o pasto. */
  surface(x: number, z: number): "camino" | "empedrado" | "pastoLuz" | "pasto";
  /** ¿Agua en (x, z)? */
  isWater(x: number, z: number): boolean;
  /** Para un punto en el agua: distancia a la orilla (m, acotada a 1,5). */
  shoreDistance(x: number, z: number): number;
  /** Distancia al borde del camino más cercano (0 encima; Infinity lejos), hasta `maxR`. */
  roadDistance(x: number, z: number, maxR: number): number;
  /** Distancia al agua (0 encima; Infinity lejos), hasta `maxR`. */
  waterDistance(x: number, z: number, maxR: number): number;
  /** Fuera de los límites: cuánto se aplanan las lomas acá (0 nada, 1 del todo), por un camino o un río. */
  flatten(x: number, z: number): number;
}

/** Adaptador de M1: el suelo desde las capas de tiles (hasta M7). */
export function tileGround(layers: readonly TileLayerData[]): GroundSource {
  const suelo = layers.find((l) => l.name === "suelo") ?? layers[0];
  const kinds = { [TILE.camino]: "camino", [TILE.empedrado]: "empedrado", [TILE.pastoLuz]: "pastoLuz" } as const;
  const isWater = (x: number, z: number): boolean => tileAt(suelo, x, z) === TILE.agua;
  return {
    surface: (x, z) => kinds[tileAt(suelo, x, z) as keyof typeof kinds] ?? "pasto",
    isWater,
    shoreDistance: (x, z) => {
      for (let r = 0.25; r <= 1.5; r += 0.25) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          if (!isWater(x + Math.cos(a) * r, z + Math.sin(a) * r)) return r;
        }
      }
      return 1.5;
    },
    roadDistance: (x, z, maxR) => distToTile(suelo, x, z, TILE.camino, maxR),
    waterDistance: (x, z, maxR) => distToTile(suelo, x, z, TILE.agua, maxR),
    flatten: () => 0,
  };
}

/** El suelo del formato de la maqueta (plan estetica-c M5): curvas muestreadas y polígonos. */
export function curveGround(g: DioramaGround): GroundSource {
  const roads = g.paths.filter((p) => p.surface === "camino");
  const waterDepth = (x: number, z: number): number => {
    // >0 adentro del agua: distancia a la orilla; 0 afuera.
    let best = 0;
    for (const poly of g.ponds) if (insidePolygon(x, z, poly)) best = Math.max(best, polygonEdgeDistance(x, z, poly));
    for (const r of g.rivers) best = Math.max(best, r.width / 2 - polylineDistance(x, z, r.line));
    return best;
  };
  return {
    surface: (x, z) => {
      for (const p of g.paths) if (polylineDistance(x, z, p.line) < p.width / 2) return p.surface;
      return "pasto";
    },
    isWater: (x, z) => waterDepth(x, z) > 0,
    shoreDistance: (x, z) => Math.min(1.5, waterDepth(x, z)),
    roadDistance: (x, z, maxR) => {
      let best = Infinity;
      for (const p of roads) best = Math.min(best, Math.max(0, polylineDistance(x, z, p.line) - p.width / 2));
      return best <= maxR ? best : Infinity;
    },
    waterDistance: (x, z, maxR) => {
      let best = Infinity;
      for (const poly of g.ponds) best = Math.min(best, insidePolygon(x, z, poly) ? 0 : polygonEdgeDistance(x, z, poly));
      for (const r of g.rivers) best = Math.min(best, Math.max(0, polylineDistance(x, z, r.line) - r.width / 2));
      return best <= maxR ? best : Infinity;
    },
    flatten: (x, z) => {
      let f = 0;
      for (const p of [...g.paths, ...g.rivers]) f = Math.max(f, 1 - smooth(p.width / 2, p.width / 2 + 2.5, polylineDistance(x, z, p.line)));
      return f;
    },
  };
}

/** La fuente del suelo de un diorama: curvas si es del formato de la maqueta; tiles si no. */
export const groundSource = (spec: Pick<TerrainSpec, "layers" | "ground">): GroundSource =>
  spec.ground?.format === "maqueta" ? curveGround(spec.ground) : tileGround(spec.layers);

interface TerrainShape {
  bounds: Bounds;
  hillMax: number;
  seed: number;
}

/** Agua: se hunde solo un vértice estrictamente adentro (los cuatro cuadrantes son agua). */
function waterSink(src: GroundSource, x: number, z: number): number | null {
  const e = 1e-3;
  const water = [[-e, -e], [e, -e], [-e, e], [e, e]].every(([dx, dz]) => src.isWater(x + (dx as number), z + (dz as number)));
  if (!water) return null;
  return -(0.3 + 0.6 * smooth(0, 1.5, src.shoreDistance(x, z)));
}

function groundHeight(shape: TerrainShape, src: GroundSource, x: number, z: number): number {
  const out = outsideDistance(shape.bounds, x, z);
  const sink = waterSink(src, x, z);
  if (out > 0) {
    // Lomas: suben suave desde el borde de los límites, con variación de altura por ruido; un camino o un río las
    // aplana (el camino sale del valle entre las lomas).
    const hill = smooth(0, HILL_RAMP, out) * Math.max(0, shape.hillMax - 0.25) * (0.55 + 0.45 * noise2(x * 0.05 + 9, z * 0.05, shape.seed));
    const wobble = (noise2(x * 0.21 + 5, z * 0.21, shape.seed) - 0.5) * 0.5 * smooth(0, 4, out);
    const h = Math.min(shape.hillMax, hill + wobble) * (1 - src.flatten(x, z));
    return sink === null ? h : Math.min(h, sink);
  }
  return sink ?? 0;
}

type Palette = Record<"pasto" | "luz" | "sombra" | "camino" | "borde" | "orilla" | "honda" | "piedra", Rgb>;

function palette(overrides: Readonly<Record<string, string>> = {}): Palette {
  const tone = (role: TerrainPaletteRole): Rgb => tokenRgb((overrides[role] ?? role) as PaletteToken);
  return {
    pasto: tone("pasto"), luz: tone("pasto-luz"), sombra: tone("pasto-sombra"), camino: tone("camino"),
    borde: tone("tierra-borde"), orilla: tone("orilla"), honda: tone("agua-honda"), piedra: tone("piedra"),
  };
}

function groundColor(p: Palette, shape: TerrainShape, src: GroundSource, x: number, z: number, h: number): Rgb {
  const seed = shape.seed;
  const n1 = noise2(x * 0.15, z * 0.15, seed);
  const n2 = noise2(x * 0.6 + 3, z * 0.6, seed);
  let c = mixRgb(mixRgb(p.pasto, p.luz, smooth(0.45, 0.8, n1) * 0.8), p.sombra, smooth(0.55, 0.9, n2) * 0.25);
  const outside = outsideDistance(shape.bounds, x, z) > 0;
  // Afuera las lomas pueden quedar apenas bajo 0 sin ser agua (el temblor del borde): ahí solo pinta agua un río.
  if (h < 0 && (!outside || src.isWater(x, z))) return mixRgb(p.orilla, p.honda, smooth(-0.3, -0.9, h));
  // Corrimiento ruidoso de la consulta: los bordes entre superficies quedan pintados a mano, no en escalones.
  const jx = x + (noise2(x * 1.9 + 7, z * 1.9, seed) - 0.5) * 0.4;
  const jz = z + (noise2(x * 1.9, z * 1.9 + 7, seed) - 0.5) * 0.4;
  const surface = src.surface(jx, jz);
  if (surface === "camino") return scaleRgb(p.camino, 1 + (n2 - 0.5) * 0.06);
  if (surface === "empedrado") return mixRgb(p.piedra, p.borde, smooth(0.4, 0.8, n2) * 0.5);
  if (outside) return mixRgb(c, p.luz, Math.min(0.5, Math.max(0, h / 6)));
  if (surface === "pastoLuz") c = mixRgb(c, p.luz, 0.7);
  const dRoad = src.roadDistance(jx, jz, 1);
  if (dRoad < 1) c = mixRgb(c, p.borde, 1 - smooth(0.1, 0.6, dRoad));
  const dWater = src.waterDistance(jx, jz, 1.2);
  if (dWater < 1.2) c = mixRgb(c, p.orilla, 1 - smooth(0.3, 1.2, dWater));
  return c;
}

export function buildTerrain(spec: TerrainSpec): Terrain {
  const { bounds } = spec;
  const t = spec.ground?.terrain;
  const shape: TerrainShape = { bounds, hillMax: t?.hills ?? HILL_MAX, seed: spec.seed ?? t?.seed ?? TERRAIN_SEED };
  const skirt = t?.extension ?? TERRAIN_SKIRT;
  const src = groundSource(spec);
  const extent: Bounds = terrainExtent(bounds, skirt);
  const { xs, zs } = terrainLines(bounds, skirt);
  const nx = xs.length;
  const nz = zs.length;
  const p = palette(spec.ground?.palette);
  const positions = new Float32Array(nx * nz * 3);
  const colors = new Float32Array(nx * nz * 3);
  const uvs = new Float32Array(nx * nz * 2);
  const heights = new Float64Array(nx * nz);
  const u0 = bounds.minX - BRUSH_UV_SKIRT;
  const v0 = bounds.minZ - BRUSH_UV_SKIRT;
  const w = bounds.maxX - bounds.minX + 2 * BRUSH_UV_SKIRT;
  const d = bounds.maxZ - bounds.minZ + 2 * BRUSH_UV_SKIRT;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i] as number;
      const z = zs[j] as number;
      const k = j * nx + i;
      const h = groundHeight(shape, src, x, z);
      heights[k] = h;
      positions.set([x, h, z], k * 3);
      colors.set(groundColor(p, shape, src, x, z, h), k * 3);
      uvs.set([(x - u0) / w, (z - v0) / d], k * 2);
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

export type DetailScatter = Record<"flores" | "matas" | "piedritas" | "empedrado", Scatter[]>;

/**
 * Instancias de detalle desde las capas (adaptador de M1): flores (6), matas (7), piedritas (8) y piedras del empedrado
 * (suelo 5). Plan estetica-c M3: una flor y una piedrita por tile, dos piedras por tile de empedrado y una mata cada dos
 * tiles en damero, para que entren los personajes con esqueleto en el presupuesto de `medium`.
 */
export function detailScatter(layers: readonly TileLayerData[], seed = TERRAIN_SEED): DetailScatter {
  const r = rng(seed * 17 + 3);
  const out: DetailScatter = { flores: [], matas: [], piedritas: [], empedrado: [] };
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
          if (id === TILE.empedrado) put(out.empedrado, tx, tz, 2, 0.8, 1.2);
        } else if (id === DETAIL.flores) put(out.flores, tx, tz, 1, 0.9, 1.4);
        else if (id === DETAIL.matas) put(out.matas, tx, tz, (((tx + tz) % 2) + 2) % 2 === 0 ? 1 : 0, 0.7, 1.1);
        else if (id === DETAIL.piedritas) put(out.piedritas, tx, tz, 1, 0.7, 1.2);
      }
    }
  }
  return out;
}

const SCALES = { flores: [0.9, 1.4], matas: [0.7, 1.1], piedritas: [0.7, 1.2], empedrado: [0.8, 1.2] } as const;
/** Intentos por instancia antes de rendirse con una zona llena (el estimador cuenta `cantidad`: cota de arriba). */
const TRIES_PER_ITEM = 60;

const walkableAt = (g: WalkGrid, x: number, z: number): boolean => {
  const col = Math.floor((x - g.originX) / g.cellSize);
  const row = Math.floor((z - g.originZ) / g.cellSize);
  return col >= 0 && row >= 0 && col < g.cols && row < g.rows && g.walkable[row * g.cols + col] === 1;
};

/**
 * Detalle del formato de la maqueta (plan estetica-c M5): `cantidad` instancias por zona, sembradas por semilla dentro
 * del círculo, nunca sobre un camino, el agua ni una celda bloqueada (props, NPCs); y las piedras de cada camino
 * empedrado a lo largo de su línea (tantas como `pavingStoneCount`, la misma cuenta del estimador).
 */
export function curveDetailScatter(ground: DioramaGround, grid: WalkGrid, seed = TERRAIN_SEED): DetailScatter {
  const out: DetailScatter = { flores: [], matas: [], piedritas: [], empedrado: [] };
  const src = curveGround(ground);
  for (const zone of ground.detail) {
    if (!(zone.kind in SCALES) || zone.kind === "empedrado") continue;
    const kind = zone.kind as "flores" | "matas" | "piedritas";
    const r = rng(seed * 101 + zone.seed * 7919);
    const [s0, s1] = SCALES[kind];
    let placed = 0;
    for (let tries = 0; placed < zone.count && tries < zone.count * TRIES_PER_ITEM; tries++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * zone.radius;
      const x = zone.x + Math.cos(a) * rad;
      const z = zone.z + Math.sin(a) * rad;
      if (!walkableAt(grid, x, z) || src.isWater(x, z) || src.surface(x, z) !== "pasto" || src.roadDistance(x, z, 0.3) < 0.3) continue;
      out[kind].push({ x, z, rot: r() * Math.PI * 2, scale: s0 + r() * (s1 - s0) });
      placed += 1;
    }
  }
  ground.paths.forEach((p, i) => {
    if (p.surface !== "empedrado") return;
    const n = pavingStoneCount(p.points, p.width);
    const r = rng(seed * 53 + i * 131);
    const cum = [0];
    for (let k = 1; k < p.line.length; k++) cum.push((cum[k - 1] as number) + Math.hypot((p.line[k] as { x: number }).x - (p.line[k - 1] as { x: number }).x, (p.line[k] as { z: number }).z - (p.line[k - 1] as { z: number }).z));
    const total = cum[cum.length - 1] as number;
    for (let s = 0; s < n; s++) {
      const target = r() * total;
      let k = 1;
      while (k < cum.length - 1 && (cum[k] as number) < target) k++;
      const a = p.line[k - 1] as { x: number; z: number };
      const b = p.line[k] as { x: number; z: number };
      const seg = Math.max(1e-9, (cum[k] as number) - (cum[k - 1] as number));
      const t = Math.min(1, Math.max(0, (target - (cum[k - 1] as number)) / seg));
      const nxDir = -(b.z - a.z) / seg;
      const nzDir = (b.x - a.x) / seg;
      const off = (r() - 0.5) * p.width * 0.85;
      const [e0, e1] = SCALES.empedrado;
      out.empedrado.push({ x: a.x + (b.x - a.x) * t + nxDir * off, z: a.z + (b.z - a.z) * t + nzDir * off, rot: r() * Math.PI * 2, scale: e0 + r() * (e1 - e0) });
    }
  });
  return out;
}
