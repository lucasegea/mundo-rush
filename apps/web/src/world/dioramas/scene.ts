// world/dioramas/scene.ts — el grafo estático del diorama en el look C (plan estetica-c M1), armado sin GPU: terreno por
// alturas, agua, props por constructor (uno por malla; los repetidos como InstancedMesh, una llamada por tipo, tamaño y
// tinte), árboles y pinos (los del layout y los del borde), detalle instanciado y las anclas de sombra blob de los
// troncos. Diorama.tsx lo monta tal cual; el estimador de presupuesto (A15) y el auditor de materiales (A4) miden ESTE
// mismo grafo, así lo medido es lo dibujado. Plan estetica-c M5: lee el formato de la maqueta (caminos y ríos por
// curvas, agua por polígonos, detalle por zonas, props con giro y tinte); desde M7 es el único formato (D-207).
// Plan estetica-c M6: se arma con la densidad del tier (DENSITY de @lg/art): en `low`, terreno más grueso, props y
// árboles de geometría reducida, menos pinos en la falda y una de cada tres instancias de detalle; el estimador de
// validate:content cuenta con la misma tabla.
// Open-world-3d T6 (D-819, D-823): un diorama con `terreno.relieve` es el mundo abierto: terreno en baldosas con el
// sombreador del suelo (clase `terreno`) y el paso del tier, un selector del suelo que hace raycast sobre la malla (el
// clic camina sobre el relieve), props y árboles apoyados en `heightAt` (bases 0,1 m abajo) y el cielo (cúpula y nubes)
// dentro del grafo, así el estimador y el auditor lo cuentan. Sin relieve, todo sigue como en estetica-c.
// Open-world-3d T7: con relieve, los árboles, las rocas y el detalle salen de `diorama.vegetation` (el sembrado del mockup
// V6 que también bloquea la grilla) por world/nature; los pinos del borde por código quedan para los dioramas sin relieve.
import {
  Box3, BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, Object3D, PlaneGeometry, Quaternion, Sphere, Vector3,
  type Intersection, type Raycaster,
} from "three";
import type { DioramaRuntime, PropBox } from "@lg/core";
import {
  DENSITY, keepDetail, OPEN_WORLD_DENSITY, TERRAIN_APRON, TERRAIN_SEED as ART_SEED, type PaletteToken, type SceneDensity, type WorldTier,
} from "@lg/art";
import type { Obstacle } from "../camera/rig";
import { toonMaterial } from "../materials/registry";
import { blob, mergeParts, painted, sphere } from "../props/geometry";
import { buildProp, isTreeAsset, TREE_CANOPY_RADIUS, TREE_HEIGHT } from "../props/builders";
import { isModelAsset } from "../props/gltf";
import type { ModelSlot } from "../props/ModelProps";
import {
  borderPines, buildTerrain, curveDetailScatter, type DetailScatter, type Scatter, type Terrain,
} from "../terrain/buildTerrain";
import { waterMaterial } from "../water/waterMaterial";
import { rng } from "../materials/rng";
import { buildSky, type Sky } from "../sky/sky";
import { groundMaterial, type GroundMaterial } from "../terrain/groundMaterial";
import { buildNature, type Nature } from "../nature/buildNature";

/** Altura del plano de agua (el terreno se hunde debajo). */
export const WATER_LEVEL = -0.15;
/** Open-world-3d T6 (D-819): los actores van 0,02 m sobre `heightAt`; las bases de props y árboles, 0,1 m abajo. */
export const ACTOR_LIFT = 0.02;
export const PROP_SINK = 0.1;

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
  /** Open-world-3d T6: el material del suelo (sus mapas .ktx2 los baja Diorama con el renderer); null sin relieve. */
  ground: GroundMaterial | null;
  /** El cielo del mundo abierto (cúpula y nubes, ya dentro de `root`); null sin relieve. */
  sky: Sky | null;
  /** Lo que recibe el clic del suelo: con relieve, un raycast sobre las baldosas del terreno; null sin relieve. */
  picker: Object3D | null;
  /** Open-world-3d T7: árboles, rocas y detalle del mundo abierto (ya dentro de `root`); null sin relieve. */
  nature: Nature | null;
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

/**
 * El terreno del mundo abierto en baldosas (D-819): los mismos buffers de vértices y un índice por baldosa, con su caja
 * (y de -40 a 80 m), así three descarta las que no se ven. `tiles` es columnas por filas, como OPEN_WORLD_DENSITY.
 */
export function terrainTiles(t: Terrain, tiles: readonly [number, number], material: GroundMaterial): Group {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(t.positions, 3));
  g.setAttribute("color", new BufferAttribute(t.colors, 3));
  g.setAttribute("uv", new BufferAttribute(t.uvs, 2));
  g.setAttribute("aDirt", new BufferAttribute(t.dirt, 1));
  g.setIndex(new BufferAttribute(t.indices, 1));
  g.computeVertexNormals();
  const nx = t.xs.length;
  const cellsX = nx - 1;
  const cellsZ = t.zs.length - 1;
  const group = new Group();
  group.name = "terreno";
  const [tx, tz] = tiles;
  for (let a = 0; a < tz; a++) {
    for (let b = 0; b < tx; b++) {
      const i0 = Math.round((b * cellsX) / tx);
      const i1 = Math.round(((b + 1) * cellsX) / tx);
      const j0 = Math.round((a * cellsZ) / tz);
      const j1 = Math.round(((a + 1) * cellsZ) / tz);
      const idx = new Uint32Array((i1 - i0) * (j1 - j0) * 6);
      let q = 0;
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const v = j * nx + i;
          idx.set([v, v + nx, v + 1, v + 1, v + nx, v + nx + 1], q);
          q += 6;
        }
      }
      const tg = new BufferGeometry();
      for (const k of ["position", "normal", "uv", "color", "aDirt"]) tg.setAttribute(k, g.getAttribute(k));
      tg.setIndex(new BufferAttribute(idx, 1));
      const box = new Box3(new Vector3(t.xs[i0], -40, t.zs[j0]), new Vector3(t.xs[i1], 80, t.zs[j1]));
      tg.boundingBox = box;
      tg.boundingSphere = box.getBoundingSphere(new Sphere());
      const m = new Mesh(tg, material.material);
      m.name = `terreno:${b},${a}`;
      m.receiveShadow = true;
      group.add(m);
    }
  }
  return group;
}

/**
 * El delantal del mundo abierto (open-world-3d M3, AC35, TERRAIN_APRON): un anillo plano de 8 triángulos desde
 * `overlap` m adentro de la extensión hasta `width` m afuera, `sink` m bajo el vértice más bajo de la malla (así queda
 * debajo de la falda donde se pisan). Usa el material del suelo, cuyo fundido de borde lo pinta entero del color de la
 * niebla: con el mapa entero en un aspecto ancho o alto, lo que se ve más allá de la falda es suelo color de niebla.
 */
export function terrainApron(t: Terrain, material: GroundMaterial): Mesh {
  const e = t.extent;
  let lowest = Infinity;
  for (let i = 1; i < t.positions.length; i += 3) lowest = Math.min(lowest, t.positions[i] as number);
  const y = lowest - TERRAIN_APRON.sink;
  const o = TERRAIN_APRON.overlap;
  const w = TERRAIN_APRON.width;
  const ring = (d: number): [number, number][] => [[e.minX - d, e.minZ - d], [e.maxX + d, e.minZ - d], [e.maxX + d, e.maxZ + d], [e.minX - d, e.maxZ + d]];
  const pts = [...ring(-o), ...ring(w)];
  const idx: number[] = [];
  // Cada triángulo con la normal hacia +y: (b - a) × (c - a) con componente y positiva.
  const tri = (a: number, b: number, c: number): void => {
    const [ax, az] = pts[a] as [number, number];
    const [bx, bz] = pts[b] as [number, number];
    const [cx, cz] = pts[c] as [number, number];
    idx.push(...((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0 ? [a, b, c] : [a, c, b]));
  };
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    tri(k, k1, 4 + k1);
    tri(k, 4 + k1, 4 + k);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(Float32Array.from(pts.flatMap(([x, z]) => [x, y, z])), 3));
  g.setAttribute("normal", new BufferAttribute(Float32Array.from(pts.flatMap(() => [0, 1, 0])), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(pts.length * 3).fill(1), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(pts.length * 2), 2));
  g.setAttribute("aDirt", new BufferAttribute(new Float32Array(pts.length), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new Mesh(g, material.material);
  m.name = "terreno:delantal";
  return m;
}

/**
 * El selector del suelo (open-world-3d T6): un objeto sin malla cuyo raycast es el de las baldosas del terreno, así el
 * clic del suelo cae en el punto del relieve que se ve (y no en un plano en y = 0). Diorama le pone el `onClick`.
 */
export function groundPicker(tiles: Object3D): Object3D {
  const picker = new Object3D();
  picker.name = "suelo:clic";
  picker.raycast = (raycaster: Raycaster, intersects: Intersection[]): void => {
    for (const hit of raycaster.intersectObject(tiles, true)) intersects.push({ ...hit, object: picker });
  };
  return picker;
}

interface Box2 { minX: number; maxX: number; minZ: number; maxZ: number }

/** Caja de todo el agua: los estanques y ríos del diorama. null si no hay agua. */
function waterBox(diorama: DioramaRuntime): Box2 | null {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const add = (x0: number, x1: number, z0: number, z1: number): void => {
    b.minX = Math.min(b.minX, x0); b.maxX = Math.max(b.maxX, x1); b.minZ = Math.min(b.minZ, z0); b.maxZ = Math.max(b.maxZ, z1);
  };
  for (const poly of diorama.ground.ponds) for (const [x, z] of poly) add(x, x, z, z);
  for (const r of diorama.ground.rivers) for (const p of r.line) add(p.x - r.width / 2, p.x + r.width / 2, p.z - r.width / 2, p.z + r.width / 2);
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

/** El detalle del suelo: las zonas de `detalle` y las piedras de los caminos empedrados. */
export function dioramaDetail(diorama: DioramaRuntime): DetailScatter {
  return curveDetailScatter(diorama.ground, diorama.grid, diorama.ground.terrain.seed ?? ART_SEED);
}

export function buildDioramaScene(diorama: DioramaRuntime, density: SceneDensity = "full", tier: WorldTier = "medium"): DioramaScene {
  const root = new Group();
  root.name = `diorama:${diorama.id}`;
  const spec = DENSITY[density];
  const relief = diorama.ground.terrain.relief;
  const terrain = buildTerrain({ bounds: diorama.bounds, ground: diorama.ground, density, tier });
  let ground: GroundMaterial | null = null;
  let sky: Sky | null = null;
  let picker: Object3D | null = null;
  if (relief) {
    // AC35: la falda se funde a la niebla en sus últimos metros y el delantal sigue de ese color (TERRAIN_APRON).
    const skirt = terrain.extent.maxX - diorama.bounds.maxX;
    ground = groundMaterial(tier, { bounds: diorama.bounds, fade: [skirt - TERRAIN_APRON.fade[0], skirt - TERRAIN_APRON.fade[1]] });
    const tiles = terrainTiles(terrain, OPEN_WORLD_DENSITY[tier].terrainTiles, ground);
    tiles.add(terrainApron(terrain, ground));
    root.add(tiles);
    picker = groundPicker(tiles);
    sky = buildSky(tier);
    root.add(sky.group);
  } else {
    root.add(terrainMesh(terrain));
  }
  // Con relieve, la base de lo apoyado sigue al terreno (0,1 m abajo); sin relieve, la `y` del layout tal cual.
  const baseY = (x: number, z: number, y: number): number => (relief ? terrain.heightAt(x, z) - PROP_SINK + y : y);
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
      t.items.push({ x: b.x, z: b.z, y: relief ? baseY(b.x, b.z, b.y) : b.y - 0.05, rot: b.rotY ?? rot, scale });
      trees.set(k, t);
      obstacles.push({ kind: "circle", x: b.x, z: b.z, r: TREE_CANOPY_RADIUS[b.asset] * scale, height: b.h });
      blobAnchors.push({ x: b.x, z: b.z, size: 1.6 * scale });
      continue;
    }
    if (isModelAsset(b.asset)) {
      models.push({ asset: b.asset, x: b.x, y: baseY(b.x, b.z, b.y), z: b.z, w: b.w, h: b.h, d: b.d, rotY: b.rotY ?? 0 });
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
      m.position.set(first.x, baseY(first.x, first.z, first.y), first.z);
      m.rotation.y = first.rotY ?? 0;
      m.receiveShadow = true;
      m.name = first.asset;
      root.add(m);
    } else {
      // Sin giro en el layout, el mismo leve vaivén de M1 entre vecinos (que no se vean clonados).
      root.add(instanced(first.asset, geo, list.map((b, i) => ({ x: b.x, y: baseY(b.x, b.z, b.y), z: b.z, rot: b.rotY ?? (i % 2) * 0.08, scale: 1 }))));
    }
  }

  // Árboles del layout y pinos del borde (fuera de los límites): una llamada por tipo y tinte. Con relieve, el borde es
  // el bosque de world/nature (T7).
  let nature: Nature | null = null;
  if (relief && diorama.vegetation) {
    nature = buildNature({ scatter: diorama.vegetation, bounds: diorama.bounds, tier, heightAt: terrain.heightAt });
    root.add(nature.group);
    for (const o of nature.obstacles) obstacles.push({ kind: "circle", x: o.x, z: o.z, r: o.r, height: o.height });
  } else {
    const seed = diorama.ground.terrain.seed ?? ART_SEED;
    const border = borderPines(diorama.bounds, seed, spec.borderPines).map((p) => ({ ...p, y: terrain.heightAt(p.x, p.z) - PROP_SINK }));
    const pines = trees.get("codigo/pino|") ?? { asset: "codigo/pino" as const, tint: undefined, items: [] };
    pines.items.push(...border);
    trees.set("codigo/pino|", pines);
  }
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
    ground,
    sky,
    picker,
    nature,
    dispose() {
      root.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); });
      for (const g of geometries) g.dispose();
      sky?.dispose();
      ground?.dispose();
      nature?.dispose();
    },
  };
}
