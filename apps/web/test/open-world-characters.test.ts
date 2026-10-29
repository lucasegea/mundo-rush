// Open-world-3d T7 (AC47): el personaje de Quaternius del mundo abierto. El jugador y los tres NPCs de U-GALEANO se arman
// con el cuerpo y los clips servidos del pipeline m7 (scripts/assets/characters.ts) sobre el esqueleto `quaternius`
// (rigs.ts): una malla con piel con pelo y cara, sin cabeza por código; la gorra del jugador es un accesorio por código
// de color 0xd6342c colgado del hueso Head; cada clip del manifiesto existe en el archivo y cada hueso que mueve, en el
// esqueleto. Los NPCs más lejos que 62 m o fuera del encuadre no se dibujan y más lejos que 28 m van sin accesorios. Los
// dioramas planos siguen con KayKit (sus tests, characters.test.ts, no cambian). No hay otro armador de personajes.
import { CAP_COLOR, DEFAULT_LOOK, parseApariencia, PLAYER_LOOK, tokenRgb, withinPaint, type CharacterLook } from "@lg/art";
import { prepareDiorama, type DioramaLayout } from "@lg/core";
import { Bone, Vector3, type AnimationClip, type Mesh, type Object3D } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { describe, expect, test } from "vitest";
import { chooseAnimation } from "../src/world/actors/animState";
import { parseCharacterGlb } from "../src/world/actors/characterAssets";
import { MIN_CLIP_SET } from "../src/world/actors/clips";
import {
  actorRig, KAYKIT_RIG, NPC_ACCESSORY_M, NPC_HIDE_M, npcDistanceRule, QUATERNIUS_RIG, rigBoneName, rigManifestBones,
} from "../src/world/actors/rigs";
import { boneKey, buildSkinnedCharacter, driveCharacter, ROPA, ROPA_ATTRIBUTE, type SkinnedCharacter } from "../src/world/actors/skinned";
import { buildDioramaScene } from "../src/world/dioramas/scene";
import { auditMaterials } from "../src/world/materials/registry";
import { modelUrl } from "../src/world/props/gltf";
import { compiledClientContent, compiledUniverseClientContent } from "./helpers";

const SERVED = import.meta.glob("../public/models/quaternius-character-animated/*.glb", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
const WEB_SOURCES = import.meta.glob("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const PACKAGE_SOURCES = import.meta.glob("../../../packages/*/src/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const fromDataUrl = (url: string): Uint8Array => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
const served = (asset: string): ArrayBuffer => {
  const url = SERVED[`../public${modelUrl(`modelo/${asset}`)}`];
  if (url === undefined) throw new Error(`no está servido ${asset}`);
  const b = fromDataUrl(url);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const cache = new Map<string, Promise<{ scene: Object3D; clips: AnimationClip[] }>>();
const load = (asset: string) => {
  let p = cache.get(asset);
  if (!p) cache.set(asset, (p = parseCharacterGlb(served(asset), MeshoptDecoder)));
  return p;
};

const galeano = compiledUniverseClientContent("U-GALEANO");
const GALEANO_NPCS = ["NPC-CERRO", "NPC-FACTOR", "NPC-MITAYO"] as const;
const galeanoLook = (id: string): CharacterLook => {
  const n = (galeano["npcs.json"] as { id: string; apariencia: unknown }[]).find((x) => x.id === id);
  const r = parseApariencia(n?.apariencia);
  if (!r.ok) throw new Error(`${id}: ${r.ok ? "" : r.error}`);
  return r.look;
};

async function openWorldCharacter(look: CharacterLook, lod: "full" | "reduced" = "full"): Promise<SkinnedCharacter> {
  const [body, clips] = await Promise.all([load(QUATERNIUS_RIG.bodyAsset(look.body, lod)), load(QUATERNIUS_RIG.clipsAsset)]);
  // Open-world-3d T7b (D-840): los accesorios son los del juego del look (DEFAULT_LOOK, el del mundo abierto).
  return buildSkinnedCharacter(body.scene, clips.clips, look, 3, QUATERNIUS_RIG, DEFAULT_LOOK.characters);
}

describe("AC47: el jugador y los NPCs del mundo abierto con el personaje de Quaternius", () => {
  test("el mundo abierto (con relieve) usa quaternius y los dioramas planos KayKit; el muelle tiene los tres NPCs de Galeano", () => {
    const layouts = galeano["dioramas.json"] as DioramaLayout[];
    const muelle = prepareDiorama(layouts.find((d) => d.id === "muelle") as DioramaLayout);
    // Cambio registrado (open-world-3d T7b, D-840): el esqueleto sale del look de la escena, no de `picker !== null`.
    const scene = buildDioramaScene(muelle, "reduced", "low");
    expect(scene.picker).not.toBeNull();
    expect(actorRig(scene.look.characters)).toBe("quaternius");
    expect([...(muelle.npcs ?? []).map((n) => n.id)].sort()).toEqual([...GALEANO_NPCS]);
    scene.dispose();
    const plano = (compiledClientContent()["dioramas.json"] as DioramaLayout[]).find((d) => d.id === "test") as DioramaLayout;
    const flat = buildDioramaScene(prepareDiorama(plano));
    expect(flat.picker).toBeNull();
    expect(actorRig(flat.look.characters)).toBe("kaykit");
    flat.dispose();
    expect(KAYKIT_RIG.codeHead).toBe(true);
  });

  test("el jugador: una malla con piel con pelo y cara, sin cabeza por código, y la gorra 0xd6342c colgada de Head", async () => {
    const c = await openWorldCharacter(PLAYER_LOOK);
    expect(c.rig.id).toBe("quaternius");
    const skinned: Mesh[] = [];
    c.root.traverse((o) => {
      if ((o as Mesh).isMesh && (o as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned.push(o as Mesh);
    });
    expect(skinned).toHaveLength(1);
    expect(c.head.parent?.name).toBe(boneKey("Head"));
    expect(c.accessories).toContain(c.head);
    expect(c.head.visible).toBe(true);
    // La gorra (no una cabeza): la mayoría de sus vértices con el rojo de la maqueta, tal cual.
    const col = c.head.geometry.getAttribute("color");
    const cap = tokenRgb(`#${CAP_COLOR.toString(16).padStart(6, "0")}`);
    let red = 0;
    for (let i = 0; i < col.count; i++) if (withinPaint([col.getX(i), col.getY(i), col.getZ(i)], cap)) red += 1;
    expect(CAP_COLOR).toBe(0xd6342c);
    expect(red / col.count).toBeGreaterThan(0.6);
    // Sin cabeza por código: ninguna malla del personaje es la esfera de radio 0,42 de head.ts; la cara está en el cuerpo.
    expect(c.meshes.filter((m) => m !== c.body && m !== c.mouth).every((m) => c.accessories.includes(m))).toBe(true);
    // El pelo está en el cuerpo con piel, sobre la cabeza: la gorra queda arriba del hueso Head, la cara al frente (+z).
    c.root.updateMatrixWorld(true);
    const head = c.headBone.getWorldPosition(new Vector3());
    c.head.geometry.computeBoundingBox();
    const top = c.head.localToWorld(c.head.geometry.boundingBox?.max.clone() ?? new Vector3());
    expect(top.y).toBeGreaterThan(head.y);
    expect(top.y).toBeGreaterThan(1.6);
    expect(top.y).toBeLessThan(2.1);
  });

  test("AC71: el jugador del mundo abierto no suma clases de material (cuerpo, gorra y boca con el toon compartido)", async () => {
    const c = await openWorldCharacter(PLAYER_LOOK);
    const a = auditMaterials(c.root);
    expect(a.unknown).toEqual([]);
    expect(Object.entries(a.byKind).filter(([, n]) => n > 0).map(([k]) => k)).toEqual(["toon"]);
    expect(a.byKind.toon).toBe(1);
  });

  test("los tres NPCs de Galeano: su remera y pantalón repintados, sombrero y bufanda como accesorios", async () => {
    for (const id of GALEANO_NPCS) {
      const look = galeanoLook(id);
      const c = await openWorldCharacter(look);
      const g = c.body.geometry;
      const ropa = g.getAttribute(ROPA_ATTRIBUTE);
      const color = g.getAttribute("color");
      let shirt = 0;
      for (let i = 0; i < ropa.count; i++) {
        if (Math.round(ropa.getX(i)) !== ROPA.remera) continue;
        shirt += 1;
        expect(withinPaint([color.getX(i), color.getY(i), color.getZ(i)], tokenRgb(look.shirt)), `${id} vértice ${i}`).toBe(true);
      }
      expect(shirt, id).toBeGreaterThan(50);
      expect(c.head.visible, `${id}: ${String(look.hat)}`).toBe(look.hat !== null);
      expect(c.accessories.length, id).toBe(1 + (look.scarf === "bufanda" ? 1 : 0));
    }
  });

  test("el -bajo de low es el mismo esqueleto con menos triángulos", async () => {
    const full = await openWorldCharacter(PLAYER_LOOK, "full");
    const low = await openWorldCharacter(PLAYER_LOOK, "reduced");
    expect([...low.bones.keys()].sort()).toEqual([...full.bones.keys()].sort());
    const tris = (c: SkinnedCharacter) => (c.body.geometry.index?.count ?? 0) / 3;
    expect(tris(low)).toBeLessThan(tris(full) * 0.5);
  });

  test("cada clip de archivo del manifiesto está en el archivo servido y cada hueso que mueve existe en el esqueleto", async () => {
    const c = await openWorldCharacter(PLAYER_LOOK);
    const clips = new Set((await load(QUATERNIUS_RIG.clipsAsset)).clips.map((x) => x.name));
    for (const id of MIN_CLIP_SET) {
      const s = QUATERNIUS_RIG.manifest[id];
      if (s.kind === "archivo") expect(clips.has(s.clip), `${id} → ${s.clip}`).toBe(true);
    }
    for (const bone of rigManifestBones(QUATERNIUS_RIG)) expect(c.bones.has(boneKey(bone)), bone).toBe(true);
    expect(rigBoneName(QUATERNIUS_RIG, "upperarm.r")).toBe("UpperArm.R");
  });

  test("caminar anima con Walk, la cabeza queda a 0,74 y saludar levanta la mano derecha", async () => {
    const c = await openWorldCharacter(PLAYER_LOOK);
    const walk = chooseAnimation({ speed: 2.5, reduceMotion: false, scene: null, gesture: null });
    const leg = c.bones.get(boneKey("UpperLeg.L")) as Bone;
    const before = leg.quaternion.clone();
    driveCharacter(c, walk, 0.3, 0, true, false);
    expect(c.state.base).toBe("Walk");
    expect(leg.quaternion.angleTo(before)).toBeGreaterThan(0.01);
    expect(c.headBone.scale.x).toBeCloseTo(0.74, 6);
    const idle = chooseAnimation({ speed: 0, reduceMotion: false, scene: null, gesture: null });
    driveCharacter(c, { ...idle, overlay: "saludar" }, 0.05, 0, true, true);
    driveCharacter(c, { ...idle, overlay: "saludar" }, 0.6, 0, true, true);
    c.root.updateMatrixWorld(true);
    const hand = (c.bones.get(boneKey("Fist.R")) as Bone).getWorldPosition(new Vector3());
    const shoulder = (c.bones.get(boneKey("UpperArm.R")) as Bone).getWorldPosition(new Vector3());
    expect(hand.y).toBeGreaterThan(shoulder.y);
  });

  test("regla de distancia de los NPCs: invisibles a más de 62 m o fuera del encuadre; sin accesorios a más de 28 m", () => {
    expect(NPC_HIDE_M).toBe(62);
    expect(NPC_ACCESSORY_M).toBe(28);
    expect(npcDistanceRule(10, true)).toEqual({ visible: true, accessories: true });
    expect(npcDistanceRule(27.9, true)).toEqual({ visible: true, accessories: true });
    expect(npcDistanceRule(28.1, true)).toEqual({ visible: true, accessories: false });
    expect(npcDistanceRule(61.9, true)).toEqual({ visible: true, accessories: false });
    expect(npcDistanceRule(62.1, true)).toEqual({ visible: false, accessories: false });
    expect(npcDistanceRule(5, false)).toEqual({ visible: false, accessories: false });
  });

  test("no hay otro armador de personajes: nada fuera de world/actors/skinned.ts clona esqueletos ni se llama makeCharacter", () => {
    const files = { ...WEB_SOURCES, ...PACKAGE_SOURCES };
    expect(Object.keys(files).length).toBeGreaterThan(100);
    const found = Object.entries(files).filter(([, text]) => /\bmakeCharacter\b|SkeletonUtils/.test(text)).map(([path]) => path);
    expect(found).toEqual(["../src/world/actors/skinned.ts"]);
  });
});
