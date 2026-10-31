// Plan estetica-c M3: skinned characters without GPU (D-016). Each sheet in content/npcs/ and the player have an
// appearance and do not repeat silhouette or shirt where they coexist; each clip of the minimal set exists in the manifest and points to
// bones that exist in the three served bodies; the animation machine and the tier selection (pure tests); the
// garment repaint, the head on the `head` bone, the gestures on the real skeleton, and the test diorama with the
// skinned characters within `medium`.
import { tokenRgb, withinPaint } from "@lg/art";
import { prepareDiorama, type DioramaRuntime } from "@lg/core";
import { Bone, Group, Quaternion, Vector3, type Object3D } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { describe, expect, test } from "vitest";
import { pickDiorama } from "../src/services/content";
import { TIER_PARAMS } from "../src/services/quality";
import { chooseAnimation, pickAnimated, TROT_SPEED } from "../src/world/actors/animState";
import { buildBlobShadows } from "../src/world/actors/BlobShadows";
import { parseCharacterGlb } from "../src/world/actors/characterAssets";
import { bodyAsset, CLIP_MANIFEST, CLIPS_ASSET, FILE_CLIPS, MIN_CLIP_SET, RIG_BONES } from "../src/world/actors/clips";
import { GESTURES, gesturePose, gestureWeight, PROCEDURAL_GESTURES } from "../src/world/actors/gestures";
import { BODY_IDS, fallbackLook, PLAYER_LOOK_ID, silhouetteKey, type CharacterLook } from "../src/world/actors/looks";
import { boneKey, buildSkinnedCharacter, driveCharacter, repaintClothes, ROPA, ROPA_ATTRIBUTE, type SkinnedCharacter } from "../src/world/actors/skinned";
import { estimateBudget, withinBudget } from "../src/world/budget/estimate";
import { buildDioramaScene } from "../src/world/dioramas/scene";
import { createNameLabel } from "../src/world/labels/labelSprite";
import { auditMaterials } from "../src/world/materials/registry";
import { fitToBox, modelUrl, parseModel } from "../src/world/props/gltf";
import { selectSceneActivity } from "../src/state/selectors";
import { initialGameState, type GameState } from "../src/state/store";
import { compiledClientContent, contentLooks, lookOf } from "./helpers";

const SERVED = import.meta.glob("../public/models/**/*.glb", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
const NPC_FILES = import.meta.glob("../../../content/npcs/*.yaml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const fromDataUrl = (url: string): Uint8Array => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
const asBuffer = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const served = (asset: string): Uint8Array => {
  const url = SERVED[`../public${modelUrl(`modelo/${asset}`)}`];
  if (url === undefined) throw new Error(`no está servido ${asset}`);
  return fromDataUrl(url);
};
/** The JSON of a .glb (without decoding buffers). */
const glbJson = (b: Uint8Array): { nodes: { name: string }[]; skins?: { joints: number[] }[]; animations?: { name: string; channels: { target: { node: number } }[] }[] } => {
  const len = new DataView(b.buffer, b.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len)));
};
const testDiorama = (): DioramaRuntime => prepareDiorama(pickDiorama(compiledClientContent()["dioramas.json"], "test"));

const NPCS = Object.values(NPC_FILES).map((t) => ({ id: /^id:\s*(\S+)/m.exec(t)?.[1] ?? "", lugar: /^lugar:\s*(\S+)/m.exec(t)?.[1] ?? "" }));

describe("M3 apariencias: cada vecino se lee por silueta y por color", () => {
  test("cada ficha de content/npcs/ trae su `apariencia` (M5) y el jugador la suya (sin caer a la de reserva)", () => {
    expect(NPCS.length).toBeGreaterThanOrEqual(6);
    const looks = contentLooks();
    for (const n of NPCS) {
      expect(n.id).toMatch(/^NPC-/);
      expect(looks[n.id], `${n.id} no tiene apariencia en su ficha`).toBeDefined();
    }
    expect(looks[PLAYER_LOOK_ID]).toBeDefined();
    for (const l of Object.values(looks)) expect(BODY_IDS).toContain(l.body);
  });

  test("no hay dos siluetas iguales; en una misma zona (y en el diorama de prueba) no se repite la remera", () => {
    const all = [PLAYER_LOOK_ID, ...NPCS.map((n) => n.id)];
    const keys = all.map((id) => silhouetteKey(lookOf(id)));
    expect(new Set(keys).size, keys.join(" / ")).toBe(all.length);
    const zones = new Map<string, string[]>();
    for (const n of NPCS) zones.set(n.lugar.split(".")[0] ?? "", [...(zones.get(n.lugar.split(".")[0] ?? "") ?? []), n.id]);
    zones.set("test", testDiorama().npcs.map((n) => n.id));
    for (const [zone, ids] of zones) {
      const shirts = [PLAYER_LOOK_ID, ...ids].map((id) => lookOf(id).shirt);
      expect(new Set(shirts).size, `${zone}: ${shirts.join(", ")}`).toBe(shirts.length);
    }
  });

  test("teeth: dos NPCs con la misma apariencia en una zona fallan la regla", () => {
    const a = lookOf("NPC-INES");
    const twin: CharacterLook = { ...a };
    expect(silhouetteKey(twin)).toBe(silhouetteKey(a));
    expect(new Set([a.shirt, twin.shirt]).size).toBe(1);
  });

  test("un id sin apariencia toma una de reserva estable y válida", () => {
    expect(fallbackLook("NPC-OTRO")).toEqual(fallbackLook("NPC-OTRO"));
    expect(BODY_IDS).toContain(fallbackLook("NPC-OTRO").body);
  });
});

describe("M3 manifiesto de animaciones contra los archivos servidos", () => {
  const clips = glbJson(served(CLIPS_ASSET));
  const bodies = BODY_IDS.map((b) => ({ b, json: glbJson(served(bodyAsset(b))) }));
  const jointsOf = (j: ReturnType<typeof glbJson>): Set<string> => new Set((j.skins?.[0]?.joints ?? []).map((i) => j.nodes[i]?.name ?? ""));

  test("los tres cuerpos tienen el esqueleto Rig_Medium completo (41 articulaciones)", () => {
    for (const { b, json } of bodies) {
      expect(json.skins?.length, b).toBe(1);
      expect([...jointsOf(json)].sort(), b).toEqual([...RIG_BONES].sort());
    }
  });

  test("cada clip del set mínimo está en el manifiesto y apunta a huesos que existen en cada cuerpo", () => {
    expect(Object.keys(CLIP_MANIFEST).sort()).toEqual([...MIN_CLIP_SET].sort());
    const byName = new Map((clips.animations ?? []).map((a) => [a.name, a]));
    for (const id of MIN_CLIP_SET) {
      const s = CLIP_MANIFEST[id];
      const bones = s.kind === "archivo"
        ? (byName.get(s.clip)?.channels ?? []).map((c) => clips.nodes[c.target.node]?.name ?? "")
        : [...s.bones];
      if (s.kind === "archivo") {
        expect(byName.has(s.clip), `${id}: falta el clip ${s.clip} en ${CLIPS_ASSET}`).toBe(true);
        expect(s.asset).toBe(CLIPS_ASSET);
      }
      expect(bones.length, id).toBeGreaterThan(0);
      for (const { b, json } of bodies) {
        const joints = jointsOf(json);
        for (const bone of bones) expect(joints.has(bone), `${id} → ${bone} no existe en cuerpo-${b}`).toBe(true);
      }
    }
  });

  test("el archivo de clips trae solo los clips que usa el manifiesto, sin mallas", () => {
    expect((clips.animations ?? []).map((a) => a.name).sort()).toEqual(expect.arrayContaining([...FILE_CLIPS].sort()));
    expect(JSON.stringify(clips)).not.toMatch(/"meshes"/);
  });

  test("cada gesto procedural mueve exactamente los huesos que declara", () => {
    for (const g of PROCEDURAL_GESTURES) {
      const moved = new Set<string>();
      for (const t of [0.1, 0.4, 0.7]) {
        const p = gesturePose(g, t);
        for (const k of [...Object.keys(p.aim), ...Object.keys(p.turn)]) moved.add(k);
      }
      expect([...moved].sort(), g).toEqual([...GESTURES[g].bones].sort());
    }
  });
});

describe("M3 máquina de animación (pura)", () => {
  const still = { speed: 0, reduceMotion: false, scene: null, gesture: null } as const;

  test("quieto da idle, velocidad de caminar da caminar, de trote da trotar", () => {
    expect(chooseAnimation(still).base).toBe("idle");
    expect(chooseAnimation({ ...still, speed: 3.5 }).base).toBe("caminar");
    expect(chooseAnimation({ ...still, speed: TROT_SPEED + 0.5 }).base).toBe("trotar");
    expect(chooseAnimation({ ...still, seated: true }).base).toBe("sentarse");
  });

  test("con reducir movimiento el rebote baja a cero", () => {
    expect(chooseAnimation(still).bounce).toBe(1);
    expect(chooseAnimation({ ...still, reduceMotion: true }).bounce).toBe(0);
    expect(chooseAnimation({ ...still, speed: 3.5, reduceMotion: true }).bounce).toBe(0);
  });

  test("en la escena: NPC habla da hablar (con boca); turno del jugador da escuchar; un gesto pedido gana", () => {
    expect(chooseAnimation({ ...still, scene: "habla" })).toMatchObject({ overlay: "hablar", mouth: true });
    expect(chooseAnimation({ ...still, scene: "escucha" })).toMatchObject({ overlay: "escuchar", mouth: false });
    expect(chooseAnimation({ ...still, scene: "escucha", gesture: "asentir" }).overlay).toBe("asentir");
    expect(chooseAnimation({ ...still, speed: 3.5, gesture: "saludar" }).overlay).toBe("saludar");
    expect(chooseAnimation(still).overlay).toBeNull();
  });

  test("la envolvente de un gesto entra, se sostiene y sale", () => {
    expect(gestureWeight(GESTURES.asentir, 0)).toBe(0);
    expect(gestureWeight(GESTURES.asentir, 0.6)).toBe(1);
    expect(gestureWeight(GESTURES.asentir, 1.2)).toBe(0);
    expect(gestureWeight(GESTURES.hablar, 30)).toBe(1);
  });
});

describe("M3 papel de cada uno en la escena (selector)", () => {
  const withDialogue = (d: Partial<GameState["dialogue"]>): GameState => {
    const s = initialGameState();
    return { ...s, dialogue: { ...s.dialogue, sceneId: "ESC-1", npcId: "NPC-NELL", connection: "open", modality: "text", ...d } };
  };

  test("el NPC habla en su línea y escucha en el turno del jugador; al arrancar saluda; sin escena, nadie", () => {
    expect(selectSceneActivity(initialGameState())).toEqual({ npcId: null, npc: null, player: null, greet: false });
    expect(selectSceneActivity(withDialogue({ state: "npcTurn" }))).toMatchObject({ npcId: "NPC-NELL", npc: "habla", player: "escucha" });
    expect(selectSceneActivity(withDialogue({ state: "playerTurn", turnSubstate: "waiting" }))).toMatchObject({ npc: "escucha", player: null });
    expect(selectSceneActivity(withDialogue({ state: "idle" }))).toMatchObject({ greet: true, npc: null });
  });

  test("la misma actividad devuelve el mismo objeto (el nivel del micrófono no re-renderiza el mundo)", () => {
    const a = selectSceneActivity(withDialogue({ state: "npcTurn" }));
    const b = selectSceneActivity(withDialogue({ state: "npcTurn", turnIndex: 3 }));
    expect(b).toBe(a);
  });
});

describe("M3 tope de personajes animados por tier (selección pura)", () => {
  const entries = [
    { id: "lejos", distance: 40, onScreen: true },
    { id: "cerca", distance: 5, onScreen: true },
    { id: "medio", distance: 20, onScreen: true },
    { id: "atras", distance: 2, onScreen: false },
  ];

  test("con más visibles que el tope, los más lejanos quedan congelados; fuera de pantalla, siempre congelado", () => {
    expect([...pickAnimated(entries, 2)].sort()).toEqual(["cerca", "medio"]);
    expect(pickAnimated(entries, 10).has("atras")).toBe(false);
    expect(pickAnimated(entries, 0).size).toBe(0);
  });

  test("los topes salen de TIER_PARAMS", () => {
    expect(pickAnimated(entries, TIER_PARAMS.low.maxAnimatedCharacters).size).toBe(3);
    expect(TIER_PARAMS["dialog-only"].maxAnimatedCharacters).toBe(0);
  });
});

const loaded = new Map<string, Promise<{ scene: Object3D; clips: import("three").AnimationClip[] }>>();
const load = (asset: string) => {
  let p = loaded.get(asset);
  if (!p) loaded.set(asset, (p = parseCharacterGlb(asBuffer(served(asset)), MeshoptDecoder)));
  return p;
};
async function character(id: string): Promise<SkinnedCharacter> {
  const look = lookOf(id);
  const [body, clips] = await Promise.all([load(bodyAsset(look.body)), load(CLIPS_ASSET)]);
  return buildSkinnedCharacter(body.scene, clips.clips, look, 7);
}

describe("M3 personaje con esqueleto (sin GPU)", () => {
  test("las prendas marcadas se repintan con la remera y el pantalón de cada uno; lo demás queda como vino", async () => {
    for (const id of ["NPC-INES", "NPC-HARLAN", PLAYER_LOOK_ID]) {
      const look = lookOf(id);
      const c = await character(id);
      const g = c.body.geometry;
      const ropa = g.getAttribute(ROPA_ATTRIBUTE);
      const color = g.getAttribute("color");
      let shirt = 0;
      let pants = 0;
      for (let i = 0; i < ropa.count; i++) {
        const slot = Math.round(ropa.getX(i));
        const rgb = [color.getX(i), color.getY(i), color.getZ(i)] as const;
        if (slot === ROPA.remera) shirt += withinPaint(rgb, tokenRgb(look.shirt)) ? 1 : 0;
        if (slot === ROPA.pantalon) pants += withinPaint(rgb, tokenRgb(look.pants)) ? 1 : 0;
      }
      expect(shirt, id).toBeGreaterThan(200);
      expect(pants, id).toBeGreaterThan(100);
      expect(auditMaterials(c.root).unknown, id).toEqual([]);
    }
  });

  test("teeth: un cuerpo sin `_ROPA` no se puede repintar (falla nombrando el cuerpo)", async () => {
    const c = await character("NPC-INES");
    const g = c.body.geometry.clone();
    g.deleteAttribute(ROPA_ATTRIBUTE);
    expect(() => repaintClothes(g, lookOf("NPC-INES"))).toThrow(/cuerpo saco: sin "_ROPA"/);
  });

  test("la cabeza por código cuelga del hueso head, derecha, y el personaje mide ~2,3 m (Maya, menos)", async () => {
    const c = await character("NPC-NELL");
    expect(c.head.parent?.name).toBe(boneKey("head"));
    c.root.updateMatrixWorld(true);
    expect(c.head.getWorldQuaternion(new Quaternion()).angleTo(new Quaternion())).toBeLessThan(1e-3);
    const top = c.head.getWorldPosition(new Vector3()).y + 0.42 * c.root.scale.x;
    expect(top).toBeGreaterThan(2.1);
    expect(top).toBeLessThan(2.5);
    const maya = await character("NPC-MAYA");
    expect(maya.root.scale.x).toBeLessThan(c.root.scale.x);
  });

  test("idle anima con el clip de archivo; asentir gira la cabeza; congelado no se mueve; sin rebote la cadera queda", async () => {
    const c = await character("NPC-INES");
    const hips = c.bones.get(boneKey("hips")) as Bone;
    const head = c.bones.get(boneKey("head")) as Bone;
    const idle = chooseAnimation({ speed: 0, reduceMotion: false, scene: null, gesture: null });
    driveCharacter(c, idle, 0.5, 0, true, false);
    expect(c.state.base).toBe("Idle");
    // The same instant without a gesture and with a nod (at 0.3 s from the start the head is going down ~0.19 rad).
    const twin = await character("NPC-INES");
    driveCharacter(twin, idle, 0.5, 0, true, false);
    driveCharacter(twin, idle, 0.3, 0, true, false);
    driveCharacter(c, { ...idle, overlay: "asentir" }, 0.3, 0, true, false);
    const nod = head.quaternion.angleTo((twin.bones.get(boneKey("head")) as Bone).quaternion);
    expect(nod).toBeGreaterThan(0.1);
    const frozen = head.quaternion.clone();
    driveCharacter(c, { ...idle, overlay: "asentir" }, 0.2, 0, false, false);
    expect(head.quaternion.angleTo(frozen)).toBe(0);
    const walk = chooseAnimation({ speed: 3.5, reduceMotion: true, scene: null, gesture: null });
    for (let i = 0; i < 10; i++) {
      driveCharacter(c, walk, 0.07, i, true, true);
      expect(hips.position.y).toBeCloseTo(c.state.hipsY, 6);
    }
  });

  test("saludar levanta la mano derecha por encima del hombro", async () => {
    const c = await character("NPC-KOFI");
    const idle = chooseAnimation({ speed: 0, reduceMotion: false, scene: null, gesture: null });
    driveCharacter(c, { ...idle, overlay: "saludar" }, 0.05, 0, true, true);
    driveCharacter(c, { ...idle, overlay: "saludar" }, 0.6, 0, true, true);
    c.root.updateMatrixWorld(true);
    const hand = (c.bones.get(boneKey("hand.r")) as Bone).getWorldPosition(new Vector3());
    const shoulder = (c.bones.get(boneKey("upperarm.r")) as Bone).getWorldPosition(new Vector3());
    expect(hand.y).toBeGreaterThan(shoulder.y);
  });

  test("con los personajes con esqueleto y los modelos de M2, el diorama de prueba entra en medium (≤ 120 llamadas, ≤ 50k triángulos)", async () => {
    const d = testDiorama();
    const scene = buildDioramaScene(d);
    const models = new Group();
    for (const slot of scene.models) {
      const url = SERVED[`../public${modelUrl(slot.asset)}`] as string;
      models.add(fitToBox(await parseModel(asBuffer(fromDataUrl(url)), slot.asset, MeshoptDecoder), slot));
    }
    const actors = await Promise.all([PLAYER_LOOK_ID, ...d.npcs.map((n) => n.id)].map(async (id) => (await character(id)).root));
    const labels = d.npcs.map((n) => createNameLabel(n.id, false));
    const blobs = buildBlobShadows(scene.blobAnchors);
    blobs.count = scene.blobAnchors.length + actors.length;
    const all = new Group();
    all.add(scene.root, models, ...actors, ...labels, blobs);
    const e = estimateBudget([all]);
    const perActor = estimateBudget(actors.slice(0, 1));
    const msg = JSON.stringify({ e, perActor, actors: estimateBudget(actors) });
    expect(auditMaterials(all).surfaceInstances, msg).toBeLessThanOrEqual(2);
    expect(perActor.drawCalls, msg).toBe(2); // body and head (the mouth, only when speaking)
    expect(withinBudget(e, { maxDrawCalls: 120, maxTriangles: 50_000 }), msg).toBe(true);
  });
});
