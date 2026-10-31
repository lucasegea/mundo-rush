// @lg/art costs.ts: what it costs to draw each piece of the world (triangles and calls), as pure data (plan estetica-c M5).
// The M1 estimator (world/budget/estimate.ts) adds up the three graph; validate:content runs in Node without three and without
// the client tree, so it adds up with this table. The table is not written by eye: apps/web/test/contenido-c.test.ts
// compares it piece by piece with the real constructors (each `codigo/*`, each possible head, the detail, the trees) and
// requires the estimate of each content diorama to be EQUAL to that of the real graph built by world/. If a constructor
// changes, that test fails and says which number to update. The triangles of the .glb files are not here: they go in their registry
// row (`triangulos`, `primitivas`) and check:budgets compares them with the served file. Plan estetica-c M6: each
// piece also has its cost at `low`'s reduced density (density.ts), and the estimator counts per tier.
import { DENSITY, type SceneDensity } from "./density.ts";
import type { CharacterLook, HairStyle, Hat, Scarf } from "./looks.ts";

/**
 * Per-tier caps from 03 §2.7.1 (the only source; this is its machine-readable copy, no threshold changes here).
 * apps/web/test requires them to match TIER_PARAMS in services/quality (the R12 contract).
 */
export const TIER_BUDGETS = {
  low: { maxDrawCalls: 60, maxTriangles: 25_000, maxTextureMb: 24 },
  medium: { maxDrawCalls: 120, maxTriangles: 50_000, maxTextureMb: 48 },
  high: { maxDrawCalls: 150, maxTriangles: 100_000, maxTextureMb: 96 },
} as const;

/** The code constructors of world/props/builders.ts (a test requires them to be exactly these). */
export const CODE_PROP_ASSETS = ["codigo/casa", "codigo/galpon", "codigo/caja", "codigo/cerco", "codigo/arbol", "codigo/pino"] as const;
export type CodePropAsset = (typeof CODE_PROP_ASSETS)[number];
export const TREE_ASSETS = ["codigo/arbol", "codigo/pino"] as const satisfies readonly CodePropAsset[];
export type TreeAsset = (typeof TREE_ASSETS)[number];
export const isCodeProp = (asset: string): asset is CodePropAsset => (CODE_PROP_ASSETS as readonly string[]).includes(asset);
export const isTreeProp = (asset: string): asset is TreeAsset => (TREE_ASSETS as readonly string[]).includes(asset);

/** The main color of each constructor: the one `tinte` replaces (walls of the house and the shed, wood for the rest). */
export const CODE_PROP_MAIN_TOKEN = {
  "codigo/casa": "casa-2",
  "codigo/galpon": "casa-1",
  "codigo/caja": "madera",
  "codigo/cerco": "madera",
  "codigo/arbol": "copa",
  "codigo/pino": "pino",
} as const satisfies Record<CodePropAsset, string>;

type FixedPropAsset = Exclude<CodePropAsset, "codigo/cerco">;
/**
 * Fixed triangles per constructor (the geometry does not change topology with size), except the fence, at each density.
 * The reduced one (M6): single-segment beveled boxes, roof with a one-cut bevel, 4-sphere canopy, 5-sided trunks.
 */
const FIXED_PROP_TRIANGLES: Readonly<Record<SceneDensity, Record<FixedPropAsset, number>>> = {
  full: { "codigo/casa": 3068, "codigo/galpon": 1268, "codigo/caja": 900, "codigo/arbol": 442, "codigo/pino": 294 },
  reduced: { "codigo/casa": 1134, "codigo/galpon": 486, "codigo/caja": 324, "codigo/arbol": 350, "codigo/pino": 200 },
};
/** The fence: one post every 1.6 m (at least 2) and two rails; at reduced density the post has 5 sides. */
export const FENCE = { postSpacing: 1.6, postTriangles: 84, railTriangles: 70, rails: 2 } as const;
const FENCE_POST_TRIANGLES: Readonly<Record<SceneDensity, number>> = { full: FENCE.postTriangles, reduced: 70 };

export const fencePosts = (length: number): number => Math.max(2, Math.ceil(length / FENCE.postSpacing) + 1);

/** Triangles of a code prop of the given size (width, height, depth), at the given density. */
export function codePropTriangles(asset: CodePropAsset, size: { w: number; h: number; d: number }, density: SceneDensity = "full"): number {
  if (asset === "codigo/cerco") return fencePosts(Math.max(size.w, size.d)) * FENCE_POST_TRIANGLES[density] + FENCE.rails * FENCE.railTriangles;
  return FIXED_PROP_TRIANGLES[density][asset];
}

/**
 * Pines planted at the edge at full density (world/terrain borderPines): upper bound (in small bounds
 * fewer may fit). The one for each density is in DENSITY (density.ts).
 */
export const BORDER_PINES = DENSITY.full.borderPines;

/** Ground detail types and triangles per instance (each type is a single instanced mesh). */
export const DETAIL_KINDS = ["flores", "matas", "piedritas"] as const;
export type DetailKind = (typeof DETAIL_KINDS)[number];
export const DETAIL_TRIANGLES = { flores: 60, matas: 100, piedritas: 20, empedrado: 20 } as const;

/** The water plane (one per diorama, covers all ponds and rivers), a quad. */
export const WATER_TRIANGLES = 2;
/** A Sprite (name label or order bubble) is a quad, one call. */
export const SPRITE_TRIANGLES = 2;
/** Blob shadows: an instanced quad (one call) under each trunk and each character. */
export const BLOB_TRIANGLES = 2;

/** Calls per skeletal character: the body and the head (the mouth only appears when speaking). */
export const ACTOR_DRAW_CALLS = 2;
/**
 * Tiers with a shadow map (03 §2.7.1: a directional light with a 1024 map only on dynamic ones, at `high`). There the body of
 * each character (the only thing that casts: not the head, so as not to shade the face) is drawn once more, in the shadow
 * pass. apps/web/test requires them to be the TIER_PARAMS tiers with `shadows: "directional"`.
 */
export const SHADOW_MAP_TIERS = ["high"] as const;
/** Suffix of the simplified body at reduced density (M6: the same skeleton, ~40 % of the triangles). */
export const REDUCED_BODY_SUFFIX = "-bajo";
/** The served asset of each look's base body (`modelo/` + this), at the given density. */
export const bodyAsset = (body: string, density: SceneDensity = "full"): string =>
  `kaykit-adventurers-1/cuerpo-${body}${density === "reduced" ? REDUCED_BODY_SUFFIX : ""}`;

/** Head by code (world/actors/head.ts): the base with cap and each piece that adds or removes. */
export const HEAD_TRIANGLES = {
  base: 570,
  hair: { casquete: 0, corto: -46, rodete: 100, coleta: 148, largo: 120 } satisfies Record<HairStyle, number>,
  hat: { gorra: 186, paja: 366, boina: 176 } satisfies Record<Hat, number>,
  scarf: { panuelo: 36, bufanda: 204 } satisfies Record<Scarf, number>,
  /** The kerchief replaces the hair cap: over the short one (which is smaller) it adds this extra. */
  panueloOverShortHair: 46,
} as const;

export function headTriangles(look: Pick<CharacterLook, "hairStyle" | "hat" | "scarf">): number {
  const h = HEAD_TRIANGLES;
  let t = h.base + h.hair[look.hairStyle] + (look.hat ? h.hat[look.hat] : 0) + (look.scarf ? h.scarf[look.scarf] : 0);
  if (look.scarf === "panuelo" && look.hairStyle === "corto") t += h.panueloOverShortHair;
  return t;
}

export interface BudgetEstimate {
  drawCalls: number;
  triangles: number;
}

export const addEstimates = (...parts: readonly BudgetEstimate[]): BudgetEstimate =>
  parts.reduce((a, b) => ({ drawCalls: a.drawCalls + b.drawCalls, triangles: a.triangles + b.triangles }), { drawCalls: 0, triangles: 0 });
