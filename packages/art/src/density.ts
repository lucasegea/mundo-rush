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
