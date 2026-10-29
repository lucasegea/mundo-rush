// @lg/art density.ts: la densidad de la escena por tier (plan estetica-c M6, 03 §2.7.1). Ningún umbral vive acá (los
// topes son TIER_BUDGETS de costs.ts, copia de §2.7.1): esto dice CÓMO se recorta la escena para que `low` entre en sus
// 60 llamadas y 25k triángulos. Una sola tabla, en dato puro, que leen world/ (arma la escena con ella) y el estimador de
// validate:content (cuenta con ella): lo estimado sigue siendo lo dibujado en cada tier.
// Decisión del manager para M6 (revisión de arquitectura 2026-10-12, §9 pregunta 3): el presupuesto de `low` manda; se recorta densidad
// (instancias de detalle, esferas de copa, resolución del terreno y de la falda, LOD de personajes), nunca un umbral.
// Medido en test.yaml con todo a la vista (el zoom más lejano, 160 m): `low` 29 llamadas y 22.302 triángulos.
// M6 SEAM: si el operador cambia umbrales después de medir (§9), cambian TIER_BUDGETS y TIER_PARAMS, no esta tabla; un
// diorama nuevo (muelle, plaza) que no entre en `low` lo frena validate:content y se recorta acá (o se pregunta).

/** Los tiers con mundo 3D (`dialog-only` no dibuja nada; `xr` está reservado, R12). */
export const WORLD_TIERS = ["low", "medium", "high"] as const;
export type WorldTier = (typeof WORLD_TIERS)[number];

/** Densidad de la escena: la completa de la biblia o la reducida de `low`. */
export const SCENE_DENSITIES = ["full", "reduced"] as const;
export type SceneDensity = (typeof SCENE_DENSITIES)[number];

/** Resolución de la malla del terreno (terrain.ts): paso fino cerca y dentro de los límites, y cómo crece en la falda. */
export interface TerrainLod {
  /** Separación de vértices cerca y dentro de los límites (m). */
  fineStep: number;
  /** Paso máximo de la grilla cerca del diorama; más allá, cada celda es `farGrowth` veces la anterior. */
  nearMaxStep: number;
  farGrowth: number;
}

export interface DensitySpec {
  /** Geometría de props por código, árboles y cuerpos: la completa o la reducida (menos segmentos, cuerpo simplificado). */
  lod: SceneDensity;
  /** De cada N instancias de detalle (flores, matas, piedritas) queda una; el empedrado queda entero (es el suelo). */
  detailKeepEvery: number;
  /** Pinos sembrados en la falda, fuera de los límites. */
  borderPines: number;
  terrain: TerrainLod;
  /**
   * "Distancia de dibujo / niebla" de 03 §2.7.1 (corta en `low`): escala de la niebla. En `low` la niebla llega antes y
   * tapa la falda más gruesa y con menos pinos.
   */
  fogScale: number;
}

export const DENSITY: Readonly<Record<SceneDensity, DensitySpec>> = {
  full: { lod: "full", detailKeepEvery: 1, borderPines: 16, terrain: { fineStep: 0.5, nearMaxStep: 3, farGrowth: 4 }, fogScale: 1 },
  reduced: { lod: "reduced", detailKeepEvery: 3, borderPines: 6, terrain: { fineStep: 1, nearMaxStep: 3, farGrowth: 8 }, fogScale: 0.85 },
};

/** La densidad de cada tier: `low` reducida, `medium` y `high` completas (la de la biblia). */
export const TIER_DENSITY: Readonly<Record<WorldTier, SceneDensity>> = { low: "reduced", medium: "full", high: "full" };

/** Cuántas instancias de detalle quedan de `n` con esa densidad (las de índice múltiplo de `detailKeepEvery`). */
export const keptDetail = (n: number, density: SceneDensity): number => Math.ceil(n / DENSITY[density].detailKeepEvery);

/** Filtra una lista de instancias de detalle según la densidad (la misma regla que cuenta `keptDetail`). */
export const keepDetail = <T>(items: readonly T[], density: SceneDensity): T[] =>
  items.filter((_, i) => i % DENSITY[density].detailKeepEvery === 0);

// ---------------------------------------------------------------------------------------------------------------------
// Open-world-3d (D-819, D-821, D-822, PD-7): la densidad del mundo abierto por tier. Es la misma tabla única de arriba
// para los dioramas con relieve (`terreno.relieve`): paso del terreno y sus baldosas, niebla, nubes, mapas normales del
// suelo y, para T7 y T8, los conteos de árboles, rocas, detalle y pasto. Los números de partida son los del mockup V6
// (`fixture.js` TIERS, medidos en la pose de inicio); el orden de recorte si un tope no entra es PD-7 (pasto, pinos
// lejanos y detalle, radio de árboles livianos, radio de árboles completos, paso del terreno, maxDpr de medium). Los
// dioramas sin relieve (campesino) siguen con DENSITY de arriba, sin cambios.

/** Radios de LOD de los árboles (m): completos hasta `full`, livianos hasta `mid`, impostores más allá (mockup LOD_R). */
export interface TreeLodRadii {
  full: number;
  mid: number;
}

export interface OpenWorldDensity {
  /** Malla del terreno: paso interior (m) y crecimiento de la falda (D-819, mockup 3,5 / 2,6 / 2,2 m). */
  terrain: TerrainLod;
  /** Baldosas del terreno (columnas, filas), cada una con su propia caja: three descarta las que no se ven. */
  terrainTiles: readonly [number, number];
  /** Escala de la niebla del tier (la "distancia de dibujo"). */
  fogScale: number;
  /** ¿Hay malla de nubes? (no en `low`). */
  clouds: boolean;
  /** ¿El suelo usa mapas normales? (no en `low`; PD-4 pasos 3 y 4 los sacan de `medium` si la memoria no entra). */
  groundNormals: boolean;
  /** Pasto V6 (T8): matas en el disco que sigue a la cámara, radio, radio de hojas reales y hojas por mata. */
  grass: { clumps: number; radius: number; nearRadius: number; blades: number };
  /** Árboles y detalle (T7). */
  trees: { pines: number; farPines: number; broads: number; bushes: number; rocks: number; ferns: number; flowers: number; pebbles: number };
  treeLod: TreeLodRadii;
}

export const OPEN_WORLD_DENSITY: Readonly<Record<WorldTier, OpenWorldDensity>> = {
  low: {
    terrain: { fineStep: 3.5, nearMaxStep: 3.5, farGrowth: 8 },
    terrainTiles: [1, 1],
    fogScale: 0.85,
    clouds: false,
    groundNormals: false,
    grass: { clumps: 1000, radius: 15, nearRadius: 4.5, blades: 8 },
    trees: { pines: 16, farPines: 90, broads: 3, bushes: 0, rocks: 8, ferns: 0, flowers: 500, pebbles: 120 },
    treeLod: { full: 0, mid: 24 },
  },
  medium: {
    terrain: { fineStep: 2.6, nearMaxStep: 3, farGrowth: 6 },
    terrainTiles: [6, 5],
    fogScale: 1,
    clouds: true,
    groundNormals: true,
    grass: { clumps: 2300, radius: 24, nearRadius: 6, blades: 8 },
    trees: { pines: 58, farPines: 150, broads: 8, bushes: 22, rocks: 30, ferns: 300, flowers: 1100, pebbles: 260 },
    treeLod: { full: 16, mid: 38 },
  },
  high: {
    terrain: { fineStep: 2.2, nearMaxStep: 3, farGrowth: 4 },
    terrainTiles: [4, 3],
    fogScale: 1.15,
    clouds: true,
    groundNormals: true,
    grass: { clumps: 7000, radius: 34, nearRadius: 8, blades: 10 },
    trees: { pines: 88, farPines: 170, broads: 12, bushes: 40, rocks: 40, ferns: 600, flowers: 1600, pebbles: 360 },
    treeLod: { full: 24, mid: 58 },
  },
};

/** Triángulos de una mata de pasto: la tarjeta (2) y cada hoja real (3, dos segmentos y la punta). */
export const GRASS_CARD_TRIANGLES = 2;
export const GRASS_BLADE_TRIANGLES = 3;

/**
 * Peor caso del pasto (AC31): todas las matas con su tarjeta, más las que caen dentro del radio de hojas reales (la
 * fracción del área de ese disco sobre el cuadrado de lado 2 × radio donde viven las matas) con todas sus hojas.
 */
export function grassWorstTriangles(g: OpenWorldDensity["grass"]): number {
  const near = Math.ceil((g.clumps * Math.PI * g.nearRadius ** 2) / (2 * g.radius) ** 2);
  return g.clumps * GRASS_CARD_TRIANGLES + near * g.blades * GRASS_BLADE_TRIANGLES;
}
