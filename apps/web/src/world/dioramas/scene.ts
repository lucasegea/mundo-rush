// world/dioramas/scene.ts — el grafo estático del diorama en el look C (plan estetica-c M1), armado sin GPU: terreno por
// alturas, agua, props por constructor (uno por malla; los repetidos como InstancedMesh, una llamada por tipo, tamaño y
// tinte), árboles y pinos (los del layout y los del borde), detalle instanciado y las anclas de sombra blob de los
// troncos. Diorama.tsx lo monta tal cual; el estimador de presupuesto (A15) y el auditor de materiales (A4) miden ESTE
// mismo grafo, así lo medido es lo dibujado. Plan estetica-c M5: lee el formato de la maqueta (caminos y ríos por
// curvas, agua por polígonos, detalle por zonas, props con giro y tinte) y sigue leyendo el de tiles de M1 hasta M7.
// Plan estetica-c M6: se arma con la densidad del tier (DENSITY de @lg/art): en `low`, terreno más grueso, props y
// árboles de geometría reducida, menos pinos en la falda y una de cada tres instancias de detalle; el estimador de
// validate:content cuenta con la misma tabla.
import {
  BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3,
} from "three";
import type { DioramaRuntime, PropBox } from "@lg/core";
import { DENSITY, keepDetail, TERRAIN_SEED as ART_SEED, type PaletteToken, type SceneDensity } from "@lg/art";
import type { Obstacle } from "../camera/rig";
import { toonMaterial } from "../materials/registry";
import { blob, mergeParts, painted, sphere } from "../props/geometry";
import { buildProp, isTreeAsset, TREE_CANOPY_RADIUS, TREE_HEIGHT } from "../props/builders";
import { isModelAsset } from "../props/gltf";
import type { ModelSlot } from "../props/ModelProps";
import {
  borderPines, buildTerrain, curveDetailScatter, detailScatter, TILE, type DetailScatter, type Scatter, type Terrain,
} from "../terrain/buildTerrain";
import { waterMaterial } from "../water/waterMaterial";
import { rng } from "../materials/rng";

/** Altura del plano de agua (el terreno se hunde debajo). */
export const WATER_LEVEL = -0.15;

export interface BlobAnchor {
  x: number;
  z: number;
  size: number;
}

export interface DioramaScene {
  root: Group;
  terrain: Terrain;
  /** Lo que puede tapar el plano de a dos (A8). */
  obstacles: Obstacle[];
  /** Sombras blob fijas (troncos), además de las de los personajes. */
  blobAnchors: BlobAnchor[];
  /** Props `modelo/*` (glTF del pipeline de M2): se cargan aparte y entran en su caja `tam`. */
  models: ModelSlot[];
  dispose(): void;
}

const Y = new Vector3(0, 1, 0);

function instanced(name: string, geo: BufferGeometry, items: readonly { x: number; y: number; z: number; rot: number; scale: number }[], castShadow = false): InstancedMesh {
  const m = new InstancedMesh(geo, toonMaterial(), Math.max(1, items.length));
  const mat = new Matrix4();
  const q = new Quaternion();
  items.forEach((it, i) => {
    q.setFromAxisAngle(Y, it.rot);
    mat.compose(new Vector3(it.x, it.y, it.z), q, new Vector3(it.scale, it.scale, it.scale));
    m.setMatrixAt(i, mat);
  });
  m.count = items.length;
  m.name = name;
  m.castShadow = castShadow;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

function terrainMesh(t: Terrain): Mesh {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(t.positions, 3));
  g.setAttribute("color", new BufferAttribute(t.colors, 3));
  g.setAttribute("uv", new BufferAttribute(t.uvs, 2));
  g.setIndex(new BufferAttribute(t.indices, 1));
  g.computeVertexNormals();
  const m = new Mesh(g, toonMaterial());
  m.name = "terreno";
  m.receiveShadow = true;
  return m;
}

interface Box2 { minX: number; maxX: number; minZ: number; maxZ: number }

/** Caja de todo el agua: los tiles 4 de la capa de suelo (M1) o los estanques y ríos (M5). null si no hay agua. */
function waterBox(diorama: DioramaRuntime): Box2 | null {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const add = (x0: number, x1: number, z0: number, z1: number): void => {
    b.minX = Math.min(b.minX, x0); b.maxX = Math.max(b.maxX, x1); b.minZ = Math.min(b.minZ, z0); b.maxZ = Math.max(b.maxZ, z1);
  };
  if (diorama.ground.format === "maqueta") {
    for (const poly of diorama.ground.ponds) for (const [x, z] of poly) add(x, x, z, z);
    for (const r of diorama.ground.rivers) for (const p of r.line) add(p.x - r.width / 2, p.x + r.width / 2, p.z - r.width / 2, p.z + r.width / 2);
  } else {
    const suelo = diorama.layers.find((l) => l.name === "suelo");
    suelo?.tiles.forEach((id, k) => {
      if (id !== TILE.agua) return;
      const x = suelo.originX + (k % suelo.width);
      const z = suelo.originZ + Math.floor(k / suelo.width);
      add(x, x + 1, z, z + 1);
    });
  }
  return Number.isFinite(b.minX) ? b : null;
}

/** Un solo plano de agua bajo todos los estanques y ríos (el terreno, más alto, lo tapa donde no hay agua). */
function waterMesh(diorama: DioramaRuntime): Mesh | null {
  const b = waterBox(diorama);
  if (!b) return null;
  const m = new Mesh(new PlaneGeometry(b.maxX - b.minX + 0.6, b.maxZ - b.minZ + 0.6).rotateX(-Math.PI / 2), waterMaterial());
  m.position.set((b.minX + b.maxX) / 2, WATER_LEVEL, (b.minZ + b.maxZ) / 2);
  m.name = "agua";
  return m;
}

const tintOf = (b: PropBox): PaletteToken | undefined => (b.tint === null ? undefined : (b.tint as PaletteToken));
const groupKey = (b: PropBox) => `${b.asset}|${b.w}|${b.h}|${b.d}|${b.tint ?? ""}`;

/** Huella de la caja en el plano (alineada a los ejes; con giro, la caja que la contiene). */
function footprintBox(b: PropBox): Box2 {
  const r = b.rotY ?? 0;
  const hw = (Math.abs(Math.cos(r)) * b.w + Math.abs(Math.sin(r)) * b.d) / 2;
  const hd = (Math.abs(Math.sin(r)) * b.w + Math.abs(Math.cos(r)) * b.d) / 2;
  return { minX: b.x - hw, maxX: b.x + hw, minZ: b.z - hd, maxZ: b.z + hd };
}

/** Geometrías del detalle del suelo (cada tipo una sola malla instanciada). */
function detailGeometries() {
  return {
    flores: mergeParts([
      painted(sphere(0.07, 5, 3).translate(0, 0.1, 0), "flor-centro"),
      painted(sphere(0.07, 5, 3).translate(0.14, 0.08, 0.05), "casa-2"),
      painted(sphere(0.07, 5, 3).translate(-0.08, 0.09, 0.12), "casa-1"),
    ]),
    matas: mergeParts([
      painted(blob(0.42, 1).translate(0, 0.26, 0), "copa", 1, { top: 0.3, bottomDark: 0.35 }),
      painted(blob(0.3, 0).translate(0.34, 0.2, 0.08), "copa", 2, { top: 0.3, bottomDark: 0.35 }),
    ]),
    piedritas: painted(blob(0.13, 0).scale(1.3, 0.55, 1).translate(0, 0.03, 0), "piedra", 3, { jitter: 0.12 }),
    empedrado: painted(blob(0.22, 0).scale(1.35, 0.32, 1.1).translate(0, 0.02, 0), "piedra", 4, { jitter: 0.14 }),
  };
}

/** El detalle del suelo según el formato del diorama. */
export function dioramaDetail(diorama: DioramaRuntime): DetailScatter {
  return diorama.ground.format === "maqueta"
    ? curveDetailScatter(diorama.ground, diorama.grid, diorama.ground.terrain.seed ?? ART_SEED)
    : detailScatter(diorama.layers);
}

export function buildDioramaScene(diorama: DioramaRuntime, density: SceneDensity = "full"): DioramaScene {
  const root = new Group();
  root.name = `diorama:${diorama.id}`;
  const spec = DENSITY[density];
  const terrain = buildTerrain({ bounds: diorama.bounds, layers: diorama.layers, ground: diorama.ground, density });
  root.add(terrainMesh(terrain));
  const water = waterMesh(diorama);
  if (water) root.add(water);

  const obstacles: Obstacle[] = [];
  const blobAnchors: BlobAnchor[] = [];
  const models: ModelSlot[] = [];
  const geometries: BufferGeometry[] = [];

  // Props sólidos: agrupados por asset, tamaño y tinte (los iguales comparten geometría y van instanciados).
  const groups = new Map<string, PropBox[]>();
  const trees = new Map<string, { asset: keyof typeof TREE_HEIGHT; tint: PaletteToken | undefined; items: (Scatter & { y: number })[] }>();
  const r = rng(29);
  for (const b of diorama.boxes) {
    const fp = footprintBox(b);
    if (isTreeAsset(b.asset)) {
      const k = `${b.asset}|${b.tint ?? ""}`;
      const t = trees.get(k) ?? { asset: b.asset, tint: tintOf(b), items: [] };
      const scale = b.h / TREE_HEIGHT[b.asset];
      const rot = r() * Math.PI * 2; // el sorteo corre siempre: un giro dado no cambia el de los árboles siguientes
      t.items.push({ x: b.x, z: b.z, y: b.y - 0.05, rot: b.rotY ?? rot, scale });
      trees.set(k, t);
      obstacles.push({ kind: "circle", x: b.x, z: b.z, r: TREE_CANOPY_RADIUS[b.asset] * scale, height: b.h });
      blobAnchors.push({ x: b.x, z: b.z, size: 1.6 * scale });
      continue;
    }
    if (isModelAsset(b.asset)) {
      models.push({ asset: b.asset, x: b.x, y: b.y, z: b.z, w: b.w, h: b.h, d: b.d, rotY: b.rotY ?? 0 });
      obstacles.push({ kind: "rect", ...fp, height: b.h });
      continue;
    }
    const k = groupKey(b);
    groups.set(k, [...(groups.get(k) ?? []), b]);
    obstacles.push({ kind: "rect", ...fp, height: b.h });
  }
  for (const list of groups.values()) {
    const first = list[0] as PropBox;
    const geo = buildProp(first.asset, { w: first.w, h: first.h, d: first.d }, 0, tintOf(first), spec.lod);
    geometries.push(geo);
    if (list.length === 1) {
      const m = new Mesh(geo, toonMaterial());
      m.position.set(first.x, first.y, first.z);
      m.rotation.y = first.rotY ?? 0;
      m.receiveShadow = true;
      m.name = first.asset;
      root.add(m);
    } else {
      // Sin giro en el layout, el mismo leve vaivén de M1 entre vecinos (que no se vean clonados).
      root.add(instanced(first.asset, geo, list.map((b, i) => ({ x: b.x, y: b.y, z: b.z, rot: b.rotY ?? (i % 2) * 0.08, scale: 1 }))));
    }
  }

  // Árboles del layout y pinos del borde (fuera de los límites): una llamada por tipo y tinte.
  const seed = diorama.ground.terrain.seed ?? ART_SEED;
  const border = borderPines(diorama.bounds, seed, spec.borderPines).map((p) => ({ ...p, y: terrain.heightAt(p.x, p.z) - 0.1 }));
  const pines = trees.get("codigo/pino|") ?? { asset: "codigo/pino" as const, tint: undefined, items: [] };
  pines.items.push(...border);
  trees.set("codigo/pino|", pines);
  for (const t of trees.values()) {
    if (t.items.length === 0) continue;
    const geo = buildProp(t.asset, { w: 0.6, h: TREE_HEIGHT[t.asset], d: 0.6 }, 1, t.tint, spec.lod);
    geometries.push(geo);
    root.add(instanced(t.asset, geo, t.items));
  }

  // Detalle del suelo (el empedrado es el suelo de la placita: queda entero en toda densidad).
  const detail = dioramaDetail(diorama);
  const dg = detailGeometries();
  for (const kind of ["flores", "matas", "piedritas", "empedrado"] as const) {
    const items = kind === "empedrado" ? detail[kind] : keepDetail(detail[kind], density);
    if (items.length === 0) continue;
    geometries.push(dg[kind]);
    root.add(instanced(`detalle:${kind}`, dg[kind], items.map((s) => ({ ...s, y: terrain.heightAt(s.x, s.z) }))));
  }
  // M5 SEAM: animales (V2 diferida). Acá se agregan los animales del diorama (modelo con esqueleto del pack que cierre
  // V2, sombra blob y lugar en el gobernador de animación); su costo entra al estimador de validate:content.

  return {
    root,
    terrain,
    obstacles,
    blobAnchors,
    models,
    dispose() {
      root.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); });
      for (const g of geometries) g.dispose();
    },
  };
}
