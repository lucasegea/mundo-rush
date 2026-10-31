// world/budget/devFactors.ts — development measurement factors (open-world-3d T10 (b), D-846). DEVELOPMENT ONLY:
// a registry with one entry per factor and a single pure reader of the query (`?factor=grass-off,post-off`, or the
// repeated parameter). GameCanvas reads it under `import.meta.env.DEV`; in `vite build` the condition is false, the branch is
// eliminated and the `data-lg-dev-factors` attribute that marks it does not reach the dist (check:dev-only looks for it).
//
// No imports on purpose: scripts/dev/perf-probe.ts imports it from node to validate `--factor=<name>`, and the
// types here are structural (they fit WorldTierParams, PostComposer and SceneKnobs without naming them).
// Each factor moves a knob that already exists; none changes a number of TIER_PARAMS or of the budgets (AC65).

/** Query parameter that `parseDevFactors` reads. */
export const DEV_FACTOR_PARAM = "factor";
/** Attribute of the map container with the active factors (marker for check:dev-only and read by the probe). */
export const DEV_FACTORS_ATTR = "data-lg-dev-factors";

/** What a factor changes. What it does not name stays as the tier leaves it. */
export interface FactorEffect {
  /** TIER_PARAMS.post of the current tier (turn off only). */
  post?: "none";
  /** EffectComposer.frameBufferType: 8 bits (UnsignedByte) instead of the default HalfFloat. */
  composer8bit?: boolean;
  /** EffectComposer.multisampling (today 0 at all post levels). */
  multisampling?: 0 | 4;
  /** The Canvas WebGL context's `antialias` (today false). With post on, the composer draws into its own buffer. */
  antialias?: boolean;
  /** TIER_PARAMS.shadows of the current tier. */
  shadows?: "none" | "directional";
  /** maxDpr of the current tier (the cap of the Canvas `dpr`). */
  maxDpr?: number;
  /** V6 grass (T8): false = the scene is built without grass. */
  grass?: boolean;
  /** Ground normal maps (OPEN_WORLD_DENSITY.groundNormals): false = ground without normals, nor does it download them. */
  groundNormals?: boolean;
  /** Tree bands: "light" = no full ones (light ones and impostors), "impostor" = impostors only. */
  treeBand?: "light" | "impostor";
}

export interface DevFactor {
  effect: FactorEffect;
  /** The knob it moves (for the report and for whoever adds a factor). */
  knob: string;
}

/**
 * The registry (T10 (b)): one factor per row of the measurement table. To add one: an entry here with its effect,
 * and if the effect is new, its field in FactorEffect and its reading in the corresponding applier below.
 */
export const DEV_FACTORS = {
  "post-off": { effect: { post: "none" }, knob: "TIER_PARAMS.post" },
  "composer-8bit": { effect: { composer8bit: true }, knob: "EffectComposer.frameBufferType" },
  "msaa-0": { effect: { multisampling: 0 }, knob: "EffectComposer.multisampling" },
  "msaa-4": { effect: { multisampling: 4 }, knob: "EffectComposer.multisampling" },
  "aa-on": { effect: { antialias: true }, knob: "Canvas gl.antialias" },
  "aa-off": { effect: { antialias: false }, knob: "Canvas gl.antialias" },
  "shadows-none": { effect: { shadows: "none" }, knob: "TIER_PARAMS.shadows" },
  // Trees cast shadows only on `high` (buildNature): on `medium` the directional light has a shadow map but
  // the trees do not cast it; it measures the cost of the map and of receiving it, not a full `high`.
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
  /** The recognized factors, without repeats, in query order. */
  names: readonly DevFactorName[];
  /** Their merged effects: if two touch the same knob, the last wins. */
  effect: Readonly<FactorEffect>;
}

export const NO_DEV_FACTORS: DevFactorSet = Object.freeze({ names: Object.freeze([]), effect: Object.freeze({}) });

/** Reads the query. Outside development there are no factors; an unknown name is ignored. */
export function parseDevFactors(search: string, dev: boolean): DevFactorSet {
  if (!dev) return NO_DEV_FACTORS;
  const raw = new URLSearchParams(search).getAll(DEV_FACTOR_PARAM).flatMap((v) => v.split(",")).map((v) => v.trim());
  const names = [...new Set(raw.filter(isDevFactor))];
  if (names.length === 0) return NO_DEV_FACTORS;
  const effect: FactorEffect = Object.assign({}, ...names.map((n) => DEV_FACTORS[n].effect));
  return { names, effect };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pure appliers: each carries the effect to the knob that already exists.

/** The tier parameters with the tier factors (post, shadows, maxDpr). Without factors, the same object. */
export function tierWithFactors<T extends { maxDpr: number | null; post: string; shadows: string }>(params: T, e: Readonly<FactorEffect>): T {
  if (e.post === undefined && e.shadows === undefined && e.maxDpr === undefined) return params;
  return {
    ...params,
    ...(e.post !== undefined ? { post: e.post } : {}),
    ...(e.shadows !== undefined ? { shadows: e.shadows } : {}),
    ...(e.maxDpr !== undefined ? { maxDpr: e.maxDpr } : {}),
  };
}

/** The post composer (Post.tsx): multisampling and 8-bit frame buffer. */
export const composerWithFactors = (e: Readonly<FactorEffect>): { multisampling: number; eightBit: boolean } =>
  ({ multisampling: e.multisampling ?? 0, eightBit: e.composer8bit === true });

/** The scene's knobs (buildDioramaScene). Without scene factors, none (the tier's scene). */
export function sceneWithFactors(e: Readonly<FactorEffect>): { grass?: boolean; groundNormals?: boolean; treeBand?: "light" | "impostor" } {
  return {
    ...(e.grass !== undefined ? { grass: e.grass } : {}),
    ...(e.groundNormals !== undefined ? { groundNormals: e.groundNormals } : {}),
    ...(e.treeBand !== undefined ? { treeBand: e.treeBand } : {}),
  };
}
