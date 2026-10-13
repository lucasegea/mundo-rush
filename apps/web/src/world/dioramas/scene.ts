// world/dioramas/scene.ts — el grafo estático del diorama en el look C (plan estetica-c M1), armado sin GPU: terreno por
// alturas, agua, props por constructor (uno por malla; los repetidos como InstancedMesh, una llamada por tipo),
// árboles y pinos (los del layout y los del borde), detalle instanciado y las anclas de sombra blob de los troncos.
// Diorama.tsx lo monta tal cual; el estimador de presupuesto (A15) y el auditor de materiales (A4) miden ESTE mismo
// grafo, así lo medido es lo dibujado.
import {
  BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3,
} from "three";
import type { DioramaRuntime, PropBox } from "@lg/core";
import type { Obstacle } from "../camera/rig";
import { toonMaterial } from "../materials/registry";
import { blob, mergeParts, painted, sphere } from "../props/geometry";
import { buildProp, isTreeAsset, TREE_CANOPY_RADIUS, TREE_HEIGHT } from "../props/builders";
import { isModelAsset } from "../props/gltf";
import type { ModelSlot } from "../props/ModelProps";
import { borderPines, buildTerrain, detailScatter, TILE, type Scatter, type Terrain } from "../terrain/buildTerrain";
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

/** Rectángulos de agua (tiles 4 de la capa de suelo), unidos en su caja. */
function waterMesh(diorama: DioramaRuntime): Mesh | null {
  const suelo = diorama.layers.find((l) => l.name === "suelo");
  if (!suelo) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  suelo.tiles.forEach((id, k) => {
    if (id !== TILE.agua) return;
    const x = suelo.originX + (k % suelo.width);
    const z = suelo.originZ + Math.floor(k / suelo.width);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x + 1); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z + 1);
  });
  if (!Number.isFinite(minX)) return null;
  const m = new Mesh(new PlaneGeometry(maxX - minX + 0.6, maxZ - minZ + 0.6).rotateX(-Math.PI / 2), waterMaterial());
  m.position.set((minX + maxX) / 2, WATER_LEVEL, (minZ + maxZ) / 2);
  m.name = "agua";
  return m;
}

const sizeKey = (b: PropBox) => `${b.asset}|${b.w}|${b.h}|${b.d}`;

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

export function buildDioramaScene(diorama: DioramaRuntime): DioramaScene {
  const root = new Group();
  root.name = `diorama:${diorama.id}`;
  const terrain = buildTerrain({ bounds: diorama.bounds, layers: diorama.layers });
  root.add(terrainMesh(terrain));
  const water = waterMesh(diorama);
  if (water) root.add(water);

  const obstacles: Obstacle[] = [];
  const blobAnchors: BlobAnchor[] = [];
  const models: ModelSlot[] = [];
  const geometries: BufferGeometry[] = [];

  // Props sólidos: agrupados por asset y tamaño (los iguales comparten geometría y van instanciados).
  const groups = new Map<string, PropBox[]>();
  const trees = new Map<keyof typeof TREE_HEIGHT, (Scatter & { y: number })[]>();
  const r = rng(29);
  for (const b of diorama.boxes) {
    if (isTreeAsset(b.asset)) {
      const list = trees.get(b.asset) ?? [];
      const scale = b.h / TREE_HEIGHT[b.asset];
      list.push({ x: b.x, z: b.z, y: b.y - 0.05, rot: r() * Math.PI * 2, scale });
      trees.set(b.asset, list);
      obstacles.push({ kind: "circle", x: b.x, z: b.z, r: TREE_CANOPY_RADIUS[b.asset] * scale, height: b.h });
      blobAnchors.push({ x: b.x, z: b.z, size: 1.6 * scale });
      continue;
    }
    if (isModelAsset(b.asset)) {
      // M2 SEAM: giro (`rotY`) y tinte por instancia llegan con el formato de diorama de M5.
      models.push({ asset: b.asset, x: b.x, y: b.y, z: b.z, w: b.w, h: b.h, d: b.d });
      obstacles.push({ kind: "rect", minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, height: b.h });
      continue;
    }
    const k = sizeKey(b);
    groups.set(k, [...(groups.get(k) ?? []), b]);
    obstacles.push({ kind: "rect", minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, height: b.h });
  }
  for (const list of groups.values()) {
    const first = list[0] as PropBox;
    const geo = buildProp(first.asset, { w: first.w, h: first.h, d: first.d });
    geometries.push(geo);
    if (list.length === 1) {
      const m = new Mesh(geo, toonMaterial());
      m.position.set(first.x, first.y, first.z);
      m.receiveShadow = true;
      m.name = first.asset;
      root.add(m);
    } else {
      root.add(instanced(first.asset, geo, list.map((b, i) => ({ x: b.x, y: b.y, z: b.z, rot: (i % 2) * 0.08, scale: 1 }))));
    }
  }

  // Árboles del layout y pinos del borde (fuera de los límites): una llamada por tipo.
  const border = borderPines(diorama.bounds).map((p) => ({ ...p, y: terrain.heightAt(p.x, p.z) - 0.1 }));
  trees.set("codigo/pino", [...(trees.get("codigo/pino") ?? []), ...border]);
  for (const [asset, list] of trees) {
    const geo = buildProp(asset, { w: 0.6, h: TREE_HEIGHT[asset], d: 0.6 }, 1);
    geometries.push(geo);
    root.add(instanced(asset, geo, list));
  }

  // Detalle del suelo.
  const detail = detailScatter(diorama.layers);
  const dg = detailGeometries();
  for (const kind of ["flores", "matas", "piedritas", "empedrado"] as const) {
    const items = detail[kind];
    if (items.length === 0) continue;
    geometries.push(dg[kind]);
    root.add(instanced(`detalle:${kind}`, dg[kind], items.map((s) => ({ ...s, y: 0 }))));
  }

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
