// world/materials/registry.ts — closed list of the world materials (plan estetica-c M1 A4, architecture review 2026-10-12): every
// material that world/ creates goes through here and is marked with its class. There are 4 classes: `toon` (the single material for all
// solid things, a single instance), `agua` (the pond shader, one instance), `etiqueta` (the name chips, one
// per texture) and `sombra-blob` (the shadow quad, one instance). A material without a mark or of another class is an
// error that the auditor (no GPU) reports. Instances are counted, not programs (instancing changes three's program).
import { MeshBasicMaterial, MeshToonMaterial, SpriteMaterial, type Material, type Object3D, type Texture } from "three";
import { blobTexture } from "./blob";
import { brushTexture, toonRamp } from "./toon";

//
// Open-world-3d T6 (D-828, PD-1, AC71): registered change to the list. Added: `terreno` (the ground splat, one
// instance), `pasto` (the grass cards and blades, two), `follaje` (tree leaves), `impostor` (one per
// baked species), `cielo` (the dome) and `nube` (the cloud mesh). Surfaces stop being only toon and water: the
// A4 cap (2 instances) still holds for the farmer diorama and the open world has its own (`surfaceInstances` <= 17).
export const WORLD_MATERIAL_KINDS = ["toon", "agua", "etiqueta", "sombra-blob", "terreno", "pasto", "follaje", "impostor", "cielo", "nube"] as const;
export type WorldMaterialKind = (typeof WORLD_MATERIAL_KINDS)[number];
/** The world surfaces (what is drawn as solid or foliage): `surfaceInstances` counts them. */
export const SURFACE_MATERIAL_KINDS: readonly WorldMaterialKind[] = ["toon", "agua", "terreno", "pasto", "follaje", "impostor"];

const TAG = "lgMaterial";

export function tagMaterial<M extends Material>(m: M, kind: WorldMaterialKind): M {
  m.userData[TAG] = kind;
  return m;
}

/** The class of a material, or null if it is not marked or its mark is not in the list. */
export function materialKind(m: Material): WorldMaterialKind | null {
  const k = m.userData[TAG] as unknown;
  return (WORLD_MATERIAL_KINDS as readonly unknown[]).includes(k) ? (k as WorldMaterialKind) : null;
}

let toon: MeshToonMaterial | null = null;
let blob: MeshBasicMaterial | null = null;

/** The toon material shared by all the solid things in the world (terrain, props, trees, characters). */
export function toonMaterial(): MeshToonMaterial {
  toon ??= tagMaterial(new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), map: brushTexture() }), "toon");
  return toon;
}

/** The blob shadow quad (under characters and trunks): transparent, not writing depth. */
export function blobShadowMaterial(): MeshBasicMaterial {
  blob ??= tagMaterial(new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, fog: true }), "sombra-blob");
  return blob;
}

/**
 * Material of a name label (A12): constant screen size without its own calculation (`sizeAttenuation: false`)
 * and without depth test, so a tree never covers it.
 */
export function labelMaterial(map: Texture): SpriteMaterial {
  return tagMaterial(new SpriteMaterial({ map, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, fog: false }), "etiqueta");
}

/**
 * Open-world-3d T5 (PD-5): the whole-map beacon (player and NPCs). It is of class `etiqueta` (a screen marker
 * like the chip): no depth test, no fog, with the opacity the zoom sets each frame.
 */
export function beaconMaterial(map: Texture): SpriteMaterial {
  return tagMaterial(new SpriteMaterial({ map, depthTest: false, depthWrite: false, transparent: true, fog: false, opacity: 0 }), "etiqueta");
}

export interface MaterialAudit {
  /** Distinct instances per class. */
  byKind: Record<WorldMaterialKind, number>;
  /** Surface instances (the classes of SURFACE_MATERIAL_KINDS). */
  surfaceInstances: number;
  /** Materials without a mark or with a mark outside the list. */
  unknown: Material[];
}

/** Walks the graph and counts the material instances per class. */
export function auditMaterials(root: Object3D): MaterialAudit {
  const seen = new Set<Material>();
  root.traverse((o) => {
    const m = (o as Object3D & { material?: Material | Material[] }).material;
    if (!m) return;
    for (const one of Array.isArray(m) ? m : [m]) seen.add(one);
  });
  const byKind = Object.fromEntries(WORLD_MATERIAL_KINDS.map((k) => [k, 0])) as Record<WorldMaterialKind, number>;
  const unknown: Material[] = [];
  for (const m of seen) {
    const k = materialKind(m);
    if (k) byKind[k] += 1;
    else unknown.push(m);
  }
  return { byKind, surfaceInstances: SURFACE_MATERIAL_KINDS.reduce((n, k) => n + byKind[k], 0), unknown };
}
