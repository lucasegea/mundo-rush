// @lg/art terrain.ts: la forma de la malla del terreno (plan estetica-c M1 ítem 8 y M5), en dato y geometría pura. Las
// líneas de la grilla salen de acá para que world/terrain/ (que arma la malla) y el estimador de presupuesto de
// validate:content (que cuenta sus triángulos sin three) usen la misma cuenta: lo estimado es lo dibujado. Movida desde
// world/terrain/buildTerrain.ts en M5 sin cambiar valores. Plan estetica-c M6: la resolución depende de la densidad del
// tier (density.ts); la completa es la de siempre.
import { DENSITY, type SceneDensity, type TerrainLod } from "./density.ts";

export interface TerrainBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Metros de terreno más allá de los límites caminables, de cada lado. Desde D-208 la falda llega a 160 m para cubrir el
 * zoom más lejano (160 m) en cualquier aspecto (A2). Es también el mínimo de `terreno.extension` de un diorama: menos
 * dejaría ver el borde del mundo.
 */
export const TERRAIN_SKIRT = 160;
/** Altura máxima de las lomas del borde (propuesta C §2) y tope de `terreno.lomas`. */
export const HILL_MAX = 5.5;
export const HILL_LIMIT = 12;
export const TERRAIN_SEED = 11;
/** Separación de vértices cerca y dentro de los límites en la densidad completa (la mitad de un metro). */
export const FINE_STEP = DENSITY.full.terrain.fineStep;
export const FINE_MARGIN = 0.5;

/**
 * Líneas de grilla: finas (`fineStep`) entre fineMin y fineMax, y cada vez más gruesas hacia min y max (de 2 a
 * `nearMaxStep` m de a un metro, y después geométricas por `farGrowth`; en la densidad completa: 2, 3, 12, 48 y el borde).
 * Plan estetica-c M3: la falda lejana bajó de resolución para que entren los personajes con esqueleto en `medium`; lo de
 * cerca (paso fino de 0,5 m) no cambió. Plan estetica-c M6: `low` usa paso fino de 1 m y una falda más gruesa.
 */
export function terrainGridLines(min: number, max: number, fineMin: number, fineMax: number, lod: TerrainLod = DENSITY.full.terrain): Float64Array {
  const fine: number[] = [];
  const snap = 1 / lod.fineStep;
  for (let v = fineMin; v <= fineMax + 1e-9; v += lod.fineStep) fine.push(Math.round(v * snap) / snap);
  const grow = (from: number, to: number, dir: 1 | -1): number[] => {
    const out: number[] = [];
    let v = from;
    let step = 2;
    while (dir > 0 ? v < to - 1e-9 : v > to + 1e-9) {
      v = dir > 0 ? Math.min(to, v + step) : Math.max(to, v - step);
      out.push(v);
      step = step < lod.nearMaxStep ? step + 1 : step * lod.farGrowth;
    }
    return out;
  };
  const left = grow(fine[0] as number, min, -1).reverse();
  const right = grow(fine[fine.length - 1] as number, max, 1);
  return Float64Array.from([...left, ...fine, ...right]);
}

/** Extensión del terreno: los límites más la falda de cada lado. */
export const terrainExtent = (b: TerrainBounds, skirt = TERRAIN_SKIRT): TerrainBounds =>
  ({ minX: b.minX - skirt, maxX: b.maxX + skirt, minZ: b.minZ - skirt, maxZ: b.maxZ + skirt });

/** Las líneas en x y en z de la malla del terreno de un diorama, con la resolución de la densidad dada. */
export function terrainLines(b: TerrainBounds, skirt = TERRAIN_SKIRT, density: SceneDensity = "full"): { xs: Float64Array; zs: Float64Array } {
  const e = terrainExtent(b, skirt);
  const lod = DENSITY[density].terrain;
  return {
    xs: terrainGridLines(e.minX, e.maxX, Math.floor(b.minX - FINE_MARGIN), Math.ceil(b.maxX + FINE_MARGIN), lod),
    zs: terrainGridLines(e.minZ, e.maxZ, Math.floor(b.minZ - FINE_MARGIN), Math.ceil(b.maxZ + FINE_MARGIN), lod),
  };
}

/** Triángulos de la malla del terreno (dos por celda). */
export function terrainTriangles(b: TerrainBounds, skirt = TERRAIN_SKIRT, density: SceneDensity = "full"): number {
  const { xs, zs } = terrainLines(b, skirt, density);
  return 2 * (xs.length - 1) * (zs.length - 1);
}

/**
 * Papeles de color del terreno que un diorama puede cambiar en su `paleta` (plan estetica-c M5): cada papel toma por
 * defecto el token de su mismo nombre; una zona puede darle otro token (por ejemplo, un pasto más seco en el Cruce).
 */
export const TERRAIN_PALETTE_ROLES = ["pasto", "pasto-luz", "pasto-sombra", "camino", "tierra-borde", "orilla", "agua-honda", "piedra"] as const;
export type TerrainPaletteRole = (typeof TERRAIN_PALETTE_ROLES)[number];

/** Piedras del empedrado por metro cuadrado de camino empedrado (las mismas dos por tile de M3). */
export const PAVING_STONES_PER_M2 = 2;

/**
 * Piedras de un camino empedrado: el largo de su polilínea de control por su ancho por la densidad. Se cuenta sobre los
 * puntos de control (no sobre la curva muestreada) para que el estimador de validate:content, que no muestrea curvas,
 * dé el mismo número que world/terrain/.
 */
export function pavingStoneCount(points: readonly (readonly [number, number])[], width: number): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as readonly [number, number];
    const b = points[i] as readonly [number, number];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return Math.round(len * width * PAVING_STONES_PER_M2);
}
