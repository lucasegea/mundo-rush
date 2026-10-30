// world/budget/devFactors.ts — factores de medición de desarrollo (open-world-3d T10 (b), D-846). SOLO DESARROLLO:
// un registro con una entrada por factor y un único lector puro de la query (`?factor=grass-off,post-off`, o el
// parámetro repetido). GameCanvas lo lee bajo `import.meta.env.DEV`; en `vite build` la condición es falsa, la rama se
// elimina y el atributo `data-lg-dev-factors` que la marca no llega al dist (check:dev-only lo busca).
//
// Sin imports a propósito: scripts/dev/perf-probe.ts lo importa desde node para validar `--factor=<nombre>`, y los
// tipos de acá son estructurales (encajan en WorldTierParams, PostComposer y SceneKnobs sin nombrarlos).
// Cada factor mueve una perilla que ya existe; ninguno cambia un número de TIER_PARAMS ni de los presupuestos (AC65).

/** Parámetro de la query que lee `parseDevFactors`. */
export const DEV_FACTOR_PARAM = "factor";
/** Atributo del contenedor del mapa con los factores activos (marcador de check:dev-only y lectura de la sonda). */
export const DEV_FACTORS_ATTR = "data-lg-dev-factors";

/** Lo que un factor cambia. Lo que no nombra queda como lo deja el tier. */
export interface FactorEffect {
  /** TIER_PARAMS.post del tier en curso (solo apagar). */
  post?: "none";
  /** EffectComposer.frameBufferType: 8 bits (UnsignedByte) en lugar del HalfFloat por defecto. */
  composer8bit?: boolean;
  /** EffectComposer.multisampling (hoy 0 en todos los niveles de post). */
  multisampling?: 0 | 4;
  /** `antialias` del contexto WebGL del Canvas (hoy false). Con post encendido el composer dibuja en su propio buffer. */
  antialias?: boolean;
  /** TIER_PARAMS.shadows del tier en curso. */
  shadows?: "none" | "directional";
  /** maxDpr del tier en curso (el tope del `dpr` del Canvas). */
  maxDpr?: number;
  /** Pasto V6 (T8): false = la escena se arma sin pasto. */
  grass?: boolean;
  /** Mapas normales del suelo (OPEN_WORLD_DENSITY.groundNormals): false = el suelo sin normales, ni las baja. */
  groundNormals?: boolean;
  /** Bandas de árboles: "light" = sin completos (livianos e impostores), "impostor" = solo impostores. */
  treeBand?: "light" | "impostor";
}

export interface DevFactor {
  effect: FactorEffect;
  /** La perilla que mueve (para el informe y para quien agregue un factor). */
  knob: string;
}

/**
 * El registro (T10 (b)): un factor por fila de la tabla de medición. Para agregar uno: una entrada acá con su efecto,
 * y si el efecto es nuevo, su campo en FactorEffect y su lectura en el aplicador correspondiente de abajo.
 */
export const DEV_FACTORS = {
  "post-off": { effect: { post: "none" }, knob: "TIER_PARAMS.post" },
  "composer-8bit": { effect: { composer8bit: true }, knob: "EffectComposer.frameBufferType" },
  "msaa-0": { effect: { multisampling: 0 }, knob: "EffectComposer.multisampling" },
  "msaa-4": { effect: { multisampling: 4 }, knob: "EffectComposer.multisampling" },
  "aa-on": { effect: { antialias: true }, knob: "Canvas gl.antialias" },
  "aa-off": { effect: { antialias: false }, knob: "Canvas gl.antialias" },
  "shadows-none": { effect: { shadows: "none" }, knob: "TIER_PARAMS.shadows" },
  // Los árboles proyectan sombra solo en `high` (buildNature): en `medium` la luz direccional tiene mapa de sombra pero
  // los árboles no la proyectan; mide el costo del mapa y de recibirla, no un `high` completo.
  "shadows-directional": { effect: { shadows: "directional" }, knob: "TIER_PARAMS.shadows" },
  "grass-off": { effect: { grass: false }, knob: "buildDioramaScene knobs.grass" },
  "trees-light": { effect: { treeBand: "light" }, knob: "buildNature treeLod (full 0)" },
  "ground-normals-off": { effect: { groundNormals: false }, knob: "groundMaterial normals" },
  "dpr-1.0": { effect: { maxDpr: 1 }, knob: "TIER_PARAMS.maxDpr" },
  "dpr-1.25": { effect: { maxDpr: 1.25 }, knob: "TIER_PARAMS.maxDpr" },
  "impostors-only": { effect: { treeBand: "impostor" }, knob: "buildNature treeLod (full 0, mid 0)" },
} as const satisfies Readonly<Record<string, DevFactor>>;

export type DevFactorName = keyof typeof DEV_FACTORS;
export const DEV_FACTOR_NAMES = Object.keys(DEV_FACTORS) as DevFactorName[];

export const isDevFactor = (name: string): name is DevFactorName => Object.hasOwn(DEV_FACTORS, name);

export interface DevFactorSet {
  /** Los factores reconocidos, sin repetir, en el orden de la query. */
  names: readonly DevFactorName[];
  /** Sus efectos mezclados: si dos tocan la misma perilla, gana el último. */
  effect: Readonly<FactorEffect>;
}

export const NO_DEV_FACTORS: DevFactorSet = Object.freeze({ names: Object.freeze([]), effect: Object.freeze({}) });

/** Lee la query. Fuera de desarrollo no hay factores; un nombre desconocido se ignora. */
export function parseDevFactors(search: string, dev: boolean): DevFactorSet {
  if (!dev) return NO_DEV_FACTORS;
  const raw = new URLSearchParams(search).getAll(DEV_FACTOR_PARAM).flatMap((v) => v.split(",")).map((v) => v.trim());
  const names = [...new Set(raw.filter(isDevFactor))];
  if (names.length === 0) return NO_DEV_FACTORS;
  const effect: FactorEffect = Object.assign({}, ...names.map((n) => DEV_FACTORS[n].effect));
  return { names, effect };
}

// ---------------------------------------------------------------------------------------------------------------------
// Aplicadores puros: cada uno lleva el efecto a la perilla que ya existe.

/** Los parámetros del tier con los factores de tier (post, sombras, maxDpr). Sin factores, el mismo objeto. */
export function tierWithFactors<T extends { maxDpr: number | null; post: string; shadows: string }>(params: T, e: Readonly<FactorEffect>): T {
  if (e.post === undefined && e.shadows === undefined && e.maxDpr === undefined) return params;
  return {
    ...params,
    ...(e.post !== undefined ? { post: e.post } : {}),
    ...(e.shadows !== undefined ? { shadows: e.shadows } : {}),
    ...(e.maxDpr !== undefined ? { maxDpr: e.maxDpr } : {}),
  };
}

/** El composer del post (Post.tsx): multisampling y frame buffer de 8 bits. */
export const composerWithFactors = (e: Readonly<FactorEffect>): { multisampling: number; eightBit: boolean } =>
  ({ multisampling: e.multisampling ?? 0, eightBit: e.composer8bit === true });

/** Las perillas de la escena (buildDioramaScene). Sin factores de escena, ninguna (la escena del tier). */
export function sceneWithFactors(e: Readonly<FactorEffect>): { grass?: boolean; groundNormals?: boolean; treeBand?: "light" | "impostor" } {
  return {
    ...(e.grass !== undefined ? { grass: e.grass } : {}),
    ...(e.groundNormals !== undefined ? { groundNormals: e.groundNormals } : {}),
    ...(e.treeBand !== undefined ? { treeBand: e.treeBand } : {}),
  };
}
