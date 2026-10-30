// world/nature/buildNature.ts — árboles, rocas y detalle del mundo abierto (open-world-3d T7, D2, PD-3, PD-9, AC37,
// AC44, AC45, AC71), port de mockup V6 (`world.js` buildVegetation, updateLOD). Lo que se siembra es @lg/art
// `vegetationScatter` (el mismo que la grilla de caminata del núcleo, `diorama.vegetation`), recortado por tier con
// `takeVegetation`. Cada especie o variante es un grupo de instancias con un nivel por banda de distancia:
//   · pinos y latifoliadas: completo (`near`), liviano (`mid`) e impostor (`far`), el relevo tramado ±4 m
//   · arbustos: completo y liviano; rocas: cerca (`near`, con normal en medium y high) y lejos (`midFar`)
//   · helechos, flores y piedritas: una banda (`nearMid`)
//   · el contacto oscuro bajo troncos y rocas: una malla para todo (estático)
// Todo se arma sin GPU (las mallas instanciadas empiezan vacías, con geometría de espera): el auditor de materiales y el
// estimador miden este mismo grafo. `load` baja los .glb y .ktx2 y hornea los impostores con el renderer; `update`
// recorre las instancias solo cuando la vista cambió (CullGate) y sube las que se ven.
// Open-world-3d T7b (D-839): especies, escaneos de roca, mapas, colores, ganancia de la hoja, luces del horneado y
// multiplicadores de densidad salen del look (`input.look`); el sembrado, las bandas, el recorte y los topes son núcleo.
import {
  BufferAttribute, BufferGeometry, Frustum, Group, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, RepeatWrapping,
  SRGBColorSpace, Euler, Vector3, Color, type Camera, type Material, type Texture, type WebGLRenderer, type WebGLRenderTarget,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  hash2, lookSpecies, OPEN_WORLD_DENSITY, publicUrl, rockFile, SMALL_ROCK_MAX_DISTANCE, takeVegetation, treeFile, treeLodShrink,
  type RockScan, type ShaderBand, type TreeSpecies, type VegetationScatter, type VegetationSpot, type WorldLook, type WorldTier,
} from "@lg/art";
import { blobTexture } from "../materials/blob";
import { loadMeshoptDecoder } from "../props/gltf";
import { ktx2Loader } from "../terrain/groundMaterial";
import { CullGate, cullGroup, viewAngles, type NatureEntry, type NatureGroup } from "./culling";
import { fernGeometry, flowerClumpGeometry, impostorGeometry, pebbleGeometry } from "./geometry";
import { bakeBox, bakeImpostor } from "./impostor";
import {
  contactShadowMaterial, flowerMaterial, foliageMaterial, impostorMaterial, natureUniforms, pebbleMaterial, placeholderTexture,
  rockMaterial, type NatureMaps,
} from "./materials";
import { flowerAtlas } from "./textures";

/** Cuánto se hunde la base de cada clase (m por unidad de escala, mockup): los troncos 0,1 (AC37), las rocas 0,12. */
export const NATURE_SINK = { pine: 0.1, broad: 0.1, bush: 0.05, rock: 0.12, fern: 0.02, flower: 0.02, pebble: 0.3 } as const;
type NatureKind = keyof typeof NATURE_SINK;
/** Altura del contacto oscuro sobre el suelo (m). */
export const AO_LIFT = 0.03;

/** Alto aproximado (m por unidad de escala) del detalle hecho por código y de las rocas (la esfera antes de cargar). */
const DETAIL_HEIGHT: Readonly<Record<Exclude<NatureKind, "pine" | "broad" | "bush">, number>> = { rock: 0.8, fern: 0.3, flower: 0.46, pebble: 0.6 };

/** Tinte por instancia de árboles y helechos, con el corrimiento al turquesa del mockup (`tealTint`). */
const tealTint = (h1: number, h2: number): [number, number, number] => {
  const b = 0.85 + 0.25 * h2;
  return [b * (1 - 0.24 * h1), b * (1 + 0.05 * h1), b * (1 + 0.3 * h1)];
};

export interface RockVariant {
  scan: RockScan;
  mesh: number;
  outcrop: boolean;
}

/** Las variantes de roca de un look: cada malla de cada escaneo chico, y el afloramiento al final (mockup `rockSets`). */
export const rockVariants = (scans: WorldLook["vegetation"]["rockScans"]): RockVariant[] => [
  ...scans.filter((r) => r.kind === "small").flatMap((r) => Array.from({ length: r.meshes }, (_, mesh) => ({ scan: r.scan, mesh, outcrop: false }))),
  ...scans.filter((r) => r.kind === "outcrop").map((r) => ({ scan: r.scan, mesh: 0, outcrop: true })),
];
/** La variante de roca de un sitio (los afloramientos al afloramiento; las chicas en rueda). */
export function rockVariant(s: VegetationSpot, variants: readonly RockVariant[]): number {
  const small = variants.filter((r) => !r.outcrop).length;
  return s.out ? variants.length - 1 : s.v % small;
}

export interface NatureInput {
  scatter: VegetationScatter;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  tier: WorldTier;
  heightAt(x: number, z: number): number;
  /** El look del diorama (open-world-3d T7b). */
  look: WorldLook;
}

/** Un tronco o una roca grande dentro de los límites, para la cámara (no tapar el plano de a dos). */
export interface NatureObstacle {
  x: number;
  z: number;
  r: number;
  height: number;
}

export interface Nature {
  group: Group;
  groups: NatureGroup[];
  /** Base de cada árbol (para AC37): x, z, y de la base y su escala. */
  treeBases: { x: number; z: number; y: number; s: number; kind: "pine" | "broad" | "bush" }[];
  obstacles: NatureObstacle[];
  gate: CullGate;
  /**
   * Por cuadro: viento y, si la vista cambió, el recorrido. `t` es el zoom (T8: los radios de LOD se achican con él,
   * treeLodShrink; 0 = los del tier). Devuelve si recorrió.
   */
  update(camera: Camera, px: number, pz: number, fogFar: number, dt: number, still: boolean, t?: number): boolean;
  /** Baja mallas y mapas y hornea los impostores (una vez). Si algo falla, la naturaleza queda sin dibujar. */
  load(renderer: WebGLRenderer): Promise<void>;
  dispose(): void;
}

const emptyGeometry = (): BufferGeometry => {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(0), 3));
  return g;
};

const instanced = (material: Material, capacity: number, castShadow: boolean, name: string): InstancedMesh => {
  const m = new InstancedMesh(emptyGeometry(), material, Math.max(1, capacity));
  m.frustumCulled = false; // el recorrido de culling.ts ya decide qué instancias van
  m.count = 0;
  m.visible = false;
  m.setColorAt(0, new Color(1, 1, 1));
  m.castShadow = castShadow;
  m.receiveShadow = true;
  m.name = name;
  return m;
};

/** Lectores por componente (también para atributos intercalados y normalizados: desnormalizan). */
const COMPONENT = ["getX", "getY", "getZ", "getW"] as const;

/**
 * La geometría de una malla de un .glb en float y con la transformación de su nodo horneada: meshopt cuantiza (enteros
 * normalizados) y la escala de la cuantización vive en el nodo, así que la geometría sola no sirve para instanciar.
 */
export function bakedGeometry(o: Mesh): BufferGeometry {
  const src = o.geometry as BufferGeometry;
  const g = new BufferGeometry();
  for (const name of ["position", "normal", "uv", "color"]) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const n = a.itemSize;
    const out = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) out[i * n + c] = a[COMPONENT[c] as (typeof COMPONENT)[number]](i);
    g.setAttribute(name, new BufferAttribute(out, n));
  }
  if (src.index) g.setIndex(new BufferAttribute(Uint32Array.from(src.index.array), 1));
  g.applyMatrix4(o.matrixWorld);
  src.dispose();
  return g;
}

const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3();

export function buildNature(input: NatureInput): Nature {
  const { tier, heightAt, look } = input;
  const veg = look.vegetation;
  const rocks = rockVariants(veg.rockScans);
  const lod = OPEN_WORLD_DENSITY[tier].treeLod;
  const normals = OPEN_WORLD_DENSITY[tier].groundNormals;
  const shadows = tier === "high";
  const take = takeVegetation(input.scatter, input.bounds, tier, veg.density);
  const u = natureUniforms(lod.full, lod.mid, veg.leafGain);
  const maps: NatureMaps = { leaf: { value: placeholderTexture() }, bark: { value: placeholderTexture() }, rockDiff: { value: placeholderTexture() }, rockNor: { value: placeholderTexture() } };
  const flowerTex = { value: placeholderTexture() as Texture };
  const leafNear = foliageMaterial(u, maps, "near");
  const leafMid = foliageMaterial(u, maps, "mid");
  const leafNearMid = foliageMaterial(u, maps, "nearMid");
  const flowers = flowerMaterial(u, flowerTex.value);
  const rockNear = rockMaterial(u, maps, "near", normals);
  const rockFar = rockMaterial(u, maps, "midFar", false);
  const pebbles = pebbleMaterial(u);
  const trees = [...lookSpecies(look, "pine"), ...lookSpecies(look, "broad")];
  const impostors = new Map(trees.map((sp) => [sp.name, impostorMaterial(u, sp.name)]));
  // El blob como color sRGB (oscuro de verdad): en lineal, el verde oscuro se aclaraba sobre la base del tronco.
  const aoTex = blobTexture();
  aoTex.colorSpace = SRGBColorSpace;
  const aoMat = contactShadowMaterial(aoTex);
  const materials: Material[] = [leafNear, leafMid, leafNearMid, flowers, rockNear, rockFar, pebbles, ...impostors.values(), aoMat];

  const group = new Group();
  group.name = "naturaleza";
  const groups: NatureGroup[] = [];
  const treeBases: Nature["treeBases"] = [];
  const obstacles: NatureObstacle[] = [];
  const ao: [number, number, number, number][] = [];
  /** Geometrías a cargar: nivel → url y malla dentro del .glb. */
  const pending: { mesh: InstancedMesh; url: string; index: number; tree?: TreeSpecies }[] = [];
  /** Las geometrías hechas acá (helechos, flores, piedritas) y los grupos de árboles a ajustar al cargar. */
  const owned: BufferGeometry[] = [];
  const impostorLevels: { mesh: InstancedMesh; species: TreeSpecies }[] = [];
  const sized: { group: NatureGroup; species: TreeSpecies }[] = [];

  const inside = (s: VegetationSpot): boolean => s.x >= input.bounds.minX && s.x <= input.bounds.maxX && s.z >= input.bounds.minZ && s.z <= input.bounds.maxZ;

  /** Arma las entradas de una variante (mockup `group`): giro, inclinación, escala con variación, tinte. */
  const entries = (spots: VegetationSpot[], vi: number, kind: NatureKind, height: number, aoScale: number): NatureEntry[] =>
    spots.map((s, i) => {
      const rock = kind === "rock" || kind === "pebble";
      const sxz = rock ? 1 : 0.88 + 0.28 * hash2(i, vi, 12);
      const sy = rock ? 1 : 0.85 + 0.4 * hash2(i, vi, 13);
      const y = heightAt(s.x, s.z) - NATURE_SINK[kind] * s.s;
      const lt = rock ? 0.4 : 0.12;
      _m.compose(_p.set(s.x, y, s.z), _q.setFromEuler(_e.set((hash2(i, vi, 3) - 0.5) * lt, s.r, (hash2(i, vi, 4) - 0.5) * lt)), _s.set(s.s * sxz, s.s * sy, s.s * sxz));
      if (aoScale > 0) ao.push([s.x, heightAt(s.x, s.z), s.z, aoScale * s.s]);
      if (kind === "pine" || kind === "broad" || kind === "bush") treeBases.push({ x: s.x, z: s.z, y, s: s.s, kind });
      const k = s.s * Math.max(sxz, sy);
      const tint: [number, number, number] = rock ? [1, 1, 1] : kind === "flower"
        ? [...veg.colors.flowerTint[i % veg.colors.flowerTint.length] as [number, number, number]]
        : tealTint(hash2(i, vi, 14), hash2(i, vi, 15));
      return {
        x: s.x, z: s.z, base: y, k, cy: y + (height / 2) * k, rad: (height / 2) * k * 1.15 + 0.5,
        maxD: kind === "rock" && !s.out ? SMALL_ROCK_MAX_DISTANCE : Infinity, matrix: _m.toArray(new Float32Array(16)), tint,
      };
    });

  /** Pinos, latifoliadas y arbustos: un grupo por especie, niveles completo, liviano e impostor (sin impostor los arbustos). */
  const treeGroups = (kind: "pine" | "broad" | "bush", list: VegetationSpot[], aoScale: number): void => {
    const species = lookSpecies(look, kind);
    species.forEach((sp, vi) => {
      const mine = list.filter((s) => s.v % species.length === vi);
      if (mine.length === 0) return;
      const g: NatureGroup = { entries: entries(mine, vi, kind, sp.height, aoScale), levels: [] };
      const near = instanced(leafNear, mine.length, shadows && kind !== "bush", `${sp.file}:completo`);
      const mid = instanced(leafMid, mine.length, false, `${sp.file}:liviano`);
      pending.push({ mesh: near, url: publicUrl(treeFile(sp, false)), index: 0, tree: sp }, { mesh: mid, url: publicUrl(treeFile(sp, true)), index: 0 });
      g.levels.push({ band: "near", mesh: near }, { band: "mid", mesh: mid });
      const imp = impostors.get(sp.name);
      if (imp) {
        const far = instanced(imp, mine.length, false, `${sp.file}:impostor`);
        g.levels.push({ band: "far", mesh: far });
        impostorLevels.push({ mesh: far, species: sp });
      }
      for (const l of g.levels) group.add(l.mesh);
      groups.push(g);
      sized.push({ group: g, species: sp });
      if (kind !== "bush") for (const s of mine) if (inside(s)) obstacles.push({ x: s.x, z: s.z, r: 0.4 * s.s, height: sp.height * s.s });
    });
  };
  treeGroups("pine", take.pines, 3.2);
  treeGroups("broad", take.broads, 3.6);
  treeGroups("bush", take.bushes, 1.8);

  // Rocas: una variante por malla de escaneo; cerca y lejos (en low, el afloramiento de cerca es el de lejos: mockup).
  rocks.forEach((rv, vi) => {
    const mine = take.rocks.filter((s) => rockVariant(s, rocks) === vi);
    if (mine.length === 0) return;
    const g: NatureGroup = { entries: entries(mine, vi, "rock", DETAIL_HEIGHT.rock, 2.4), levels: [] };
    const near = instanced(rockNear, mine.length, shadows, `${rv.scan}:${rv.mesh}:cerca`);
    const far = instanced(rockFar, mine.length, false, `${rv.scan}:${rv.mesh}:lejos`);
    const nearFile = tier === "low" && rv.outcrop ? rockFile(rv.scan, true) : rockFile(rv.scan, false);
    pending.push({ mesh: near, url: publicUrl(nearFile), index: rv.mesh }, { mesh: far, url: publicUrl(rockFile(rv.scan, true)), index: rv.mesh });
    g.levels.push({ band: "near", mesh: near }, { band: "midFar", mesh: far });
    for (const l of g.levels) group.add(l.mesh);
    groups.push(g);
    for (const s of mine) if (inside(s) && s.out) obstacles.push({ x: s.x, z: s.z, r: 0.45 * s.s, height: 0.6 * s.s });
  });

  /** Detalle hecho por código: helechos (2 variantes), flores y piedritas, banda `nearMid`. */
  const detail = (kind: "fern" | "flower" | "pebble", list: VegetationSpot[], geos: BufferGeometry[], material: Material): void => {
    owned.push(...geos);
    geos.forEach((geo, vi) => {
      const mine = list.filter((s) => s.v % geos.length === vi);
      if (mine.length === 0) return;
      const mesh = instanced(material, mine.length, false, `detalle:${kind}:${vi}`);
      mesh.geometry.dispose();
      mesh.geometry = geo;
      const g: NatureGroup = { entries: entries(mine, vi, kind, DETAIL_HEIGHT[kind], 0), levels: [{ band: "nearMid", mesh }] };
      group.add(mesh);
      groups.push(g);
    });
  };
  detail("fern", take.ferns, [fernGeometry(0, veg.colors.fern, veg.leafGain), fernGeometry(1, veg.colors.fern, veg.leafGain)], leafNearMid);
  detail("flower", take.flowers, [flowerClumpGeometry()], flowers);
  detail("pebble", take.pebbles, [pebbleGeometry(veg.colors.pebble)], pebbles);

  // El contacto oscuro: estático, una llamada.
  const aoGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  owned.push(aoGeo);
  const aoMesh = new InstancedMesh(aoGeo, aoMat, Math.max(1, ao.length));
  aoMesh.name = "naturaleza:contacto";
  aoMesh.frustumCulled = false;
  // 3 cm sobre el suelo (el mockup usaba 10): más alto, el quad tapaba la base del tronco vista desde arriba.
  ao.forEach(([x, y, z, s], i) => aoMesh.setMatrixAt(i, _m.compose(_p.set(x, y + AO_LIFT, z), _q.identity(), _s.set(s, s, s))));
  aoMesh.count = ao.length;
  group.add(aoMesh);

  const gate = new CullGate();
  const frustum = new Frustum();
  const pv = new Matrix4();
  const camPos = new Vector3();
  let loaded = false;
  let loading: Promise<void> | null = null;
  let alive = true;
  const loadedGeometries: BufferGeometry[] = [];
  const targets: WebGLRenderTarget[] = [];
  const textures: Texture[] = [];

  /** Con la malla completa a mano, la esfera de cada árbol pasa a ser la de su geometría (mockup). */
  const resize = (sp: TreeSpecies, geo: BufferGeometry): void => {
    geo.computeBoundingSphere();
    const bs = geo.boundingSphere;
    if (!bs) return;
    for (const g of sized.filter((x) => x.species === sp)) {
      for (const e of g.group.entries) {
        e.cy = e.base + bs.center.y * e.k;
        e.rad = bs.radius * e.k * 1.15 + 0.5;
      }
    }
  };
  const target = new Vector3();

  return {
    group,
    groups,
    treeBases,
    obstacles,
    gate,
    update(camera, px, pz, fogFar, dt, still, t = 0) {
      u.uPl.value.set(px, pz);
      const shrink = treeLodShrink(t);
      const full = lod.full * shrink;
      const mid = lod.mid * shrink;
      u.uSwayA.value = still ? 0 : 1;
      if (!still) u.uSwayT.value += dt;
      if (!loaded) return false;
      camera.updateMatrixWorld();
      camera.getWorldPosition(camPos);
      const { yawDeg, pitchDeg } = viewAngles(camera.matrixWorld);
      const distance = camPos.distanceTo(target.set(px, heightAt(px, pz), pz));
      if (!gate.shouldUpdate({ x: px, z: pz, yawDeg, pitchDeg, distance })) return false;
      frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      // Los radios del sombreador cambian junto con el recorrido: lo subido y lo tramado usan los mismos.
      u.uLod.value.set(full, mid);
      const view = { cx: px, cz: pz, camera: camPos, frustum, fogFar, full, mid };
      for (const g of groups) cullGroup(g, view);
      return true;
    },
    load(renderer) {
      alive = true;
      loading ??= (async () => {
        const meshopt = await loadMeshoptDecoder();
        const gltf = new GLTFLoader().setMeshoptDecoder(meshopt);
        const ktx2 = ktx2Loader(renderer);
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const files = new Map<string, Promise<BufferGeometry[]>>();
        const geometriesOf = (url: string): Promise<BufferGeometry[]> => {
          let p = files.get(url);
          if (!p) {
            p = gltf.loadAsync(`${base}${url}`).then((g) => {
              const out: BufferGeometry[] = [];
              g.scene.updateMatrixWorld(true);
              g.scene.traverse((o) => {
                if (!(o instanceof Mesh)) return;
                out.push(bakedGeometry(o));
                for (const m of Array.isArray(o.material) ? o.material : [o.material]) (m as Material).dispose();
              });
              loadedGeometries.push(...out);
              return out;
            });
            files.set(url, p);
          }
          return p;
        };
        const tex = async (file: string, srgb: boolean, repeat: boolean): Promise<Texture> => {
          const t = await ktx2.loadAsync(`${base}${publicUrl(file)}`);
          if (srgb) t.colorSpace = SRGBColorSpace;
          if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
          t.anisotropy = 4;
          textures.push(t);
          return t;
        };
        const [leaf, bark, rockDiff, rockNor] = await Promise.all([
          tex(veg.textures.leaf, true, false),
          tex(veg.textures.bark, true, true),
          tex(veg.textures.rockDiff, true, false),
          normals ? tex(veg.textures.rockNor, false, false) : Promise.resolve(null),
        ]);
        const geos = await Promise.all(pending.map(async (p) => ({ p, geo: (await geometriesOf(p.url))[p.index] })));
        if (!alive) return;
        for (const { p, geo } of geos) {
          if (!geo) throw new Error(`naturaleza: ${p.url} no tiene la malla ${p.index}`);
          p.mesh.geometry.dispose();
          p.mesh.geometry = geo;
          if (p.tree) resize(p.tree, geo);
        }
        // Mapas: los placeholders se cambian por los .ktx2 (mismo `USE_MAP`: sin recompilar).
        for (const [slot, t] of [[maps.leaf, leaf], [maps.bark, bark], [maps.rockDiff, rockDiff]] as const) {
          slot.value.dispose();
          slot.value = t;
        }
        for (const m of [leafNear, leafMid, leafNearMid]) m.map = leaf;
        rockNear.map = rockDiff;
        rockFar.map = rockDiff;
        if (rockNor) {
          maps.rockNor.value.dispose();
          maps.rockNor.value = rockNor;
          rockNear.normalMap = rockNor;
        }
        const fl = flowerAtlas(veg.colors);
        flowerTex.value.dispose();
        flowerTex.value = fl;
        flowers.map = fl;
        textures.push(fl);
        // Impostores: cada especie se hornea con su malla completa y un follaje sin banda (fuera de la escena).
        const bakeMat = foliageMaterial(u, maps, null);
        try {
          for (const sp of trees) {
            const full = geos.find(({ p }) => p.tree === sp)?.geo;
            const imp = impostors.get(sp.name);
            if (!full || !imp) continue;
            const rt = bakeImpostor(renderer, full, bakeMat, look.light.impostor);
            targets.push(rt);
            imp.map = rt.texture;
            imp.needsUpdate = true;
            const card = impostorGeometry(bakeBox(full));
            owned.push(card);
            for (const l of impostorLevels.filter((x) => x.species === sp)) {
              l.mesh.geometry.dispose();
              l.mesh.geometry = card;
            }
          }
        } finally {
          bakeMat.dispose();
        }
        for (const m of materials) m.needsUpdate = true;
        loaded = true;
        gate.reset();
      })();
      return loading;
    },
    dispose() {
      alive = false;
      group.traverse((o) => { if (o instanceof InstancedMesh) o.dispose(); });
      for (const m of materials) m.dispose();
      for (const g of [...owned, ...loadedGeometries]) g.dispose();
      for (const t of [...textures, maps.leaf.value, maps.bark.value, maps.rockDiff.value, maps.rockNor.value, flowerTex.value]) t.dispose();
      for (const rt of targets) rt.dispose();
      aoMat.map?.dispose();
    },
  };
}

/** Los tipos de banda de cada nivel, para los tests (AC71: una variante de sombreador por banda). */
export const natureBands = (n: Nature): ShaderBand[] => n.groups.flatMap((g) => g.levels.map((l) => l.band));
