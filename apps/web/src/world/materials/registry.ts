// world/materials/registry.ts — lista cerrada de materiales del mundo (plan estetica-c M1 A4, revisión de arquitectura 2026-10-12): todo
// material que world/ crea pasa por acá y queda marcado con su clase. Hay 4 clases: `toon` (el material único de todo
// lo sólido, una sola instancia), `agua` (el shader del estanque, una instancia), `etiqueta` (los chips de nombre, una
// por textura) y `sombra-blob` (el quad de las sombras, una instancia). Un material sin marca o de otra clase es un
// error que el auditor (sin GPU) reporta. Se cuentan instancias, no programas (instanciar cambia el programa de three).
import { MeshBasicMaterial, MeshToonMaterial, SpriteMaterial, type Material, type Object3D, type Texture } from "three";
import { blobTexture } from "./blob";
import { brushTexture, toonRamp } from "./toon";

export const WORLD_MATERIAL_KINDS = ["toon", "agua", "etiqueta", "sombra-blob"] as const;
export type WorldMaterialKind = (typeof WORLD_MATERIAL_KINDS)[number];
/** Las superficies del mundo: como máximo 2 instancias en total (A4). */
export const SURFACE_MATERIAL_KINDS: readonly WorldMaterialKind[] = ["toon", "agua"];

const TAG = "lgMaterial";

export function tagMaterial<M extends Material>(m: M, kind: WorldMaterialKind): M {
  m.userData[TAG] = kind;
  return m;
}

/** La clase de un material, o null si no está marcado o su marca no es de la lista. */
export function materialKind(m: Material): WorldMaterialKind | null {
  const k = m.userData[TAG] as unknown;
  return (WORLD_MATERIAL_KINDS as readonly unknown[]).includes(k) ? (k as WorldMaterialKind) : null;
}

let toon: MeshToonMaterial | null = null;
let blob: MeshBasicMaterial | null = null;

/** El material toon compartido por todo lo sólido del mundo (terreno, props, árboles, personajes). */
export function toonMaterial(): MeshToonMaterial {
  toon ??= tagMaterial(new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), map: brushTexture() }), "toon");
  return toon;
}

/** El quad de sombra blob (debajo de personajes y troncos): transparente, sin escribir profundidad. */
export function blobShadowMaterial(): MeshBasicMaterial {
  blob ??= tagMaterial(new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, fog: true }), "sombra-blob");
  return blob;
}

/**
 * Material de una etiqueta de nombre (A12): tamaño constante en pantalla sin cálculo propio (`sizeAttenuation: false`)
 * y sin test de profundidad, así nunca la tapa un árbol.
 */
export function labelMaterial(map: Texture): SpriteMaterial {
  return tagMaterial(new SpriteMaterial({ map, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, fog: false }), "etiqueta");
}

/**
 * Open-world-3d T5 (PD-5): la baliza del mapa entero (jugador y NPCs). Es de la clase `etiqueta` (un marcador de pantalla
 * como el chip): sin test de profundidad, sin niebla, con la opacidad que fija el zoom cada cuadro.
 */
export function beaconMaterial(map: Texture): SpriteMaterial {
  return tagMaterial(new SpriteMaterial({ map, depthTest: false, depthWrite: false, transparent: true, fog: false, opacity: 0 }), "etiqueta");
}

export interface MaterialAudit {
  /** Instancias distintas por clase. */
  byKind: Record<WorldMaterialKind, number>;
  /** Instancias de superficie (toon + agua). */
  surfaceInstances: number;
  /** Materiales sin marca o con una marca fuera de la lista. */
  unknown: Material[];
}

/** Recorre el grafo y cuenta las instancias de material por clase. */
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
