// world/props/builders.ts — code-built rounded prop builders (plan estetica-c M1 item 10): one per type
// of `codigo/*` asset, each returns ONE geometry (pieces painted per vertex and merged) with the base at y = 0,
// centered in x, z and of the layout `tam` size. A `codigo/*` asset without a builder fails clearly (A6). Rule from
// the bible as a test (A5): no pair of neighboring triangles forms a dihedral angle of 80° or more. Plan estetica-c M5:
// `tinte` (a palette token) replaces each builder main color (CODE_PROP_MAIN_TOKEN from @lg/art);
// the builder list is @lg/art (CODE_PROP_ASSETS), which validate:content also reads. Plan estetica-c M6:
// each builder has a reduced version for `low` (fewer segments, one sphere fewer in the canopy), with the same
// silhouette and the same bevel rule; their triangles are in the @lg/art table (REDUCED_PROP_TRIANGLES).
import type { BufferGeometry } from "three";
import { CODE_PROP_MAIN_TOKEN, type CodePropAsset, type SceneDensity } from "@lg/art";
import { rng } from "../materials/rng";
import {
  blob, capsule, capsuleX, extrudeRounded, lathe, mergeParts, painted, roundedBox, roundedShape, type Paint,
} from "./geometry";

export interface PropSize {
  w: number;
  h: number;
  d: number;
}

export type PropBuilder = (size: PropSize, seed: number, tint: Paint | undefined, lod: SceneDensity) => BufferGeometry;

/**
 * Segments per density. In the reduced one nothing drops below 5 sides around (a 4-sided prism has 90° edges: the
 * bevel rule rejects it) and the bevels stay single-cut at 45°.
 */
const SEG = {
  full: { box: 2, bevel: 3, curve: 5, capRadial: 6, rail: 5, canopy: 5, trunk: 7, pine: 9, pineTrunk: 6 },
  reduced: { box: 1, bevel: 1, curve: 3, capRadial: 5, rail: 5, canopy: 4, trunk: 5, pine: 6, pineTrunk: 5 },
} as const satisfies Record<SceneDensity, Record<string, number>>;

/** The beveled box with the density segments. */
const boxOf = (lod: SceneDensity) => (w: number, h: number, d: number, r: number): BufferGeometry => roundedBox(w, h, d, r, SEG[lod].box);

/** Rounded gable roof: triangular profile with all corners soft, extruded along x. */
function gableRoof(width: number, depth: number, rise: number, eave: number, color: Paint, seed: number, lod: SceneDensity): BufferGeometry {
  const hw = depth / 2 + eave;
  const shape = roundedShape([[-hw, 0], [hw, 0], [0, rise]], 0.32);
  const g = extrudeRounded(shape, width + 2 * eave - 0.24, 0.12, SEG[lod].bevel, SEG[lod].curve).rotateY(Math.PI / 2);
  return painted(g, color, seed, { top: 0.22, jitter: 0.16, bottomDark: 0.25 });
}

function casa({ w, h, d }: PropSize, seed: number, tint: Paint = CODE_PROP_MAIN_TOKEN["codigo/casa"], lod: SceneDensity = "full"): BufferGeometry {
  const wallH = h * 0.62;
  const rise = h - wallH + 0.05;
  const box = boxOf(lod);
  const parts = [
    painted(box(w + 0.3, 0.3, d + 0.3, 0.12), "zocalo", seed),
    painted(box(w, wallH, d, 0.28), tint, seed, { top: 0.08, bottomDark: 0.12, jitter: 0.05 }),
    gableRoof(w, d, rise, 0.45, "techo", seed, lod).translate(0, wallH - 0.05, 0),
    painted(capsuleX(0.16, w + 0.5, SEG[lod].capRadial), "cumbrera", seed).translate(0, wallH - 0.05 + rise - 0.2, 0),
    painted(box(0.5, 1.1, 0.5, 0.1), "chimenea", seed).translate(w * 0.28, wallH + 0.25, -d * 0.12),
    painted(box(0.8, 1.35, 0.14, 0.06), "madera", seed).translate(0, 0.1, d / 2),
  ];
  for (const x of [-w * 0.3, w * 0.3]) {
    parts.push(painted(box(0.7, 0.6, 0.1, 0.045), "ventana", seed, { jitter: 0.02 }).translate(x, wallH * 0.45, d / 2));
    parts.push(painted(box(0.86, 0.1, 0.22, 0.045), "madera", seed).translate(x, wallH * 0.45 - 0.1, d / 2 + 0.04));
  }
  parts.push(painted(box(0.1, 0.6, 0.7, 0.045), "ventana", seed, { jitter: 0.02 }).translate(w / 2, wallH * 0.45, 0));
  return mergeParts(parts);
}

function galpon({ w, h, d }: PropSize, seed: number, tint: Paint = CODE_PROP_MAIN_TOKEN["codigo/galpon"], lod: SceneDensity = "full"): BufferGeometry {
  const wallH = h * 0.62;
  const rise = h - wallH + 0.05;
  const box = boxOf(lod);
  return mergeParts([
    painted(box(w, wallH, d, 0.22), tint, seed, { top: 0.06, bottomDark: 0.2, jitter: 0.06 }),
    gableRoof(w, d, rise, 0.35, "zocalo", seed, lod).translate(0, wallH - 0.05, 0),
    painted(capsuleX(0.14, w + 0.4, SEG[lod].capRadial), "madera", seed).translate(0, wallH - 0.05 + rise - 0.18, 0),
    painted(box(Math.min(1.6, w * 0.4), wallH * 0.82, 0.14, 0.06), "tronco", seed, { jitter: 0.12 }).translate(0, 0, d / 2),
    painted(box(0.1, wallH * 0.3, 0.6, 0.045), "ventana", seed, { jitter: 0.02 }).translate(w / 2, wallH * 0.5, 0),
  ]);
}

function caja({ w, h, d }: PropSize, seed: number, tint: Paint = CODE_PROP_MAIN_TOKEN["codigo/caja"], lod: SceneDensity = "full"): BufferGeometry {
  const box = boxOf(lod);
  return mergeParts([
    painted(box(w * 0.92, h * 0.86, d * 0.92, 0.1), tint, seed, { jitter: 0.15 }),
    painted(box(w * 0.97, 0.12, d * 0.97, 0.05), "tronco", seed).translate(0, h * 0.18, 0),
    painted(box(w * 0.97, 0.12, d * 0.97, 0.05), "tronco", seed).translate(0, h * 0.6, 0),
  ]);
}

function cerco({ w, h, d }: PropSize, seed: number, tint: Paint = CODE_PROP_MAIN_TOKEN["codigo/cerco"], lod: SceneDensity = "full"): BufferGeometry {
  const alongX = w > d;
  const len = alongX ? w : d;
  const posts = Math.max(2, Math.ceil(len / 1.6) + 1);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < posts; i++) {
    const z = -len / 2 + 0.1 + ((len - 0.2) * i) / (posts - 1);
    parts.push(painted(capsule(0.09, h, SEG[lod].capRadial), tint, seed + i, { jitter: 0.12 }).translate(0, 0, z));
  }
  for (const y of [0.45 * h, 0.8 * h]) parts.push(painted(capsuleX(0.055, len, SEG[lod].rail).rotateY(Math.PI / 2), tint, seed, { jitter: 0.12 }).translate(0, y, 0));
  const g = mergeParts(parts);
  return alongX ? g.rotateY(Math.PI / 2) : g;
}

/** Reference height of the trees: the instance is scaled to `tam.y / height`. */
export const TREE_HEIGHT = { "codigo/arbol": 4.5, "codigo/pino": 4.6 } as const;
/** Canopy radius (for the chat camera occlusion test), at scale 1. */
export const TREE_CANOPY_RADIUS = { "codigo/arbol": 1.9, "codigo/pino": 1.3 } as const;

function arbol(_size: PropSize, seed: number, tint: Paint = CODE_PROP_MAIN_TOKEN["codigo/arbol"], lod: SceneDensity = "full"): BufferGeometry {
  const r = rng(10 + seed);
  const blobs: BufferGeometry[] = [];
  const n = SEG[lod].canopy;
  for (let i = 0; i < n; i++) {
    const s = 0.8 + r() * 0.5;
    const a = (i / n) * Math.PI * 2 + r();
    const rad = i === 0 ? 0 : 0.8;
    blobs.push(blob(s, 1).scale(1, 0.85, 1).translate(Math.cos(a) * rad, 2.75 + (i === 0 ? 0.55 : r() * 0.45), Math.sin(a) * rad));
  }
  const canopy = painted(mergeParts(blobs), tint, seed, { top: 0.25, bottomDark: 0.35, jitter: 0.1 });
  const trunk = painted(lathe([[0.3, -0.1], [0.22, 0.25], [0.17, 0.9], [0.15, 2.6]], SEG[lod].trunk), "tronco", seed, { top: 0.05, bottomDark: 0.2 });
  return mergeParts([canopy, trunk]);
}

function pino(_size: PropSize, seed: number, tint: Paint = CODE_PROP_MAIN_TOKEN["codigo/pino"], lod: SceneDensity = "full"): BufferGeometry {
  const tiers = [[1.25, 1.0], [0.95, 1.85], [0.66, 2.7]] as const;
  const leaves = tiers.map(([R, b]) => lathe([[R * 0.55, b - 0.03], [R * 0.9, b - 0.04], [R, b + 0.06], [R * 0.97, b + 0.17], [R * 0.86, b + 0.26], [0, b + 1.6]], SEG[lod].pine));
  return mergeParts([
    painted(mergeParts(leaves), tint, seed, { top: 0.2, bottomDark: 0.3 }),
    painted(lathe([[0.2, -0.1], [0.14, 0.3], [0.12, 1.2]], SEG[lod].pineTrunk), "tronco", seed),
  ]);
}

export const PROP_BUILDERS: Readonly<Record<CodePropAsset, PropBuilder>> = {
  "codigo/casa": casa,
  "codigo/galpon": galpon,
  "codigo/caja": caja,
  "codigo/cerco": cerco,
  "codigo/arbol": arbol,
  "codigo/pino": pino,
};

export const isTreeAsset = (asset: string): asset is keyof typeof TREE_HEIGHT => asset in TREE_HEIGHT;

/**
 * Prop geometry; an asset without a builder fails with a message that names it (A6). `tint` replaces the main
 * color; `lod` picks the full geometry or the reduced one of `low` (plan estetica-c M6).
 */
export function buildProp(asset: string, size: PropSize, seed = 0, tint?: Paint, lod: SceneDensity = "full"): BufferGeometry {
  const builder = (PROP_BUILDERS as Readonly<Record<string, PropBuilder | undefined>>)[asset];
  if (!builder) throw new Error(`world/props: no hay constructor para el asset "${asset}"`);
  return builder(size, seed, tint, lod);
}
