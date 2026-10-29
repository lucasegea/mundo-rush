// world/actors/skinned.ts — el personaje con esqueleto (plan estetica-c M3): clona un cuerpo base del pipeline con su
// esqueleto propio (SkeletonUtils), repinta remera y pantalón con los tokens de su apariencia (los vértices marcados con
// `_ROPA` en scripts/assets/characters.ts), le cuelga del hueso `head` la cabeza por código (head.ts, una malla) y la
// boca, y arma el mezclador con los clips compartidos. `driveCharacter` aplica la elección de animState.ts: cruza los
// clips de base, suma el gesto procedural (gestures.ts) y, con "reducir movimiento", deja la cadera a su altura.
// Open-world-3d T7 (AC47): el esqueleto llega como `RigSpec` (rigs.ts). Con el de Quaternius no hay cabeza por código:
// el modelo trae pelo y cara, y los accesorios (gorra, sombrero, bufanda: accessories.ts) cuelgan de sus huesos.
import {
  AnimationMixer, BufferAttribute, BufferGeometry, Euler, Group, LoopOnce, LoopRepeat, Mesh, PropertyBinding, Quaternion, SkinnedMesh, Vector3,
  type AnimationAction, type AnimationClip, type Bone, type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { paintColors, tokenRgb } from "@lg/art";
import { toonMaterial } from "../materials/registry";
import type { AnimChoice } from "./animState";
import { openWorldAccessories, type AccessoryCast } from "./accessories";
import type { ClipId } from "./clips";
import { gesturePose, PROCEDURAL_GESTURES, type ProceduralGesture } from "./gestures";
import { characterHeadGeometry, mouthGeometry } from "./head";
import type { CharacterLook } from "./looks";
import { KAYKIT_RIG, rigBoneName, type RigSpec } from "./rigs";

/** Escala del personaje con esqueleto: el hueso de la cabeza a 1,24 + la cabeza por código da ~2,3 m (como el de M1). */
export const CHARACTER_SCALE = KAYKIT_RIG.scale;
/** Centro de la cabeza por código sobre el hueso `head` (unidades del esqueleto). */
export const HEAD_OFFSET = 0.4;
/** Valores de `_ROPA` (los de scripts/assets/characters.ts). */
export const ROPA = { fija: 0, remera: 1, pantalon: 2 } as const;
/** El atributo `_ROPA` como lo deja GLTFLoader (los atributos propios van en minúscula). */
export const ROPA_ATTRIBUTE = "_ropa";
const CROSSFADE = 0.25;

/** Nombre de un hueso del glTF como lo deja GLTFLoader (`upperarm.r` → `upperarmr`). */
export const boneKey = (name: string): string => PropertyBinding.sanitizeNodeName(name);

export interface SkinnedCharacter {
  root: Group;
  body: SkinnedMesh;
  /** La cabeza por código (KayKit) o el accesorio de la cabeza (Quaternius; sin sombrero, una malla vacía oculta). */
  head: Mesh;
  mouth: Mesh;
  rig: RigSpec;
  headBone: Bone;
  /** Los accesorios por código (Quaternius): se ocultan de lejos (rigs.ts, NPC_ACCESSORY_M). */
  accessories: Mesh[];
  bones: ReadonlyMap<string, Bone>;
  mixer: AnimationMixer;
  actions: ReadonlyMap<string, AnimationAction>;
  /** Estado del cruce de clips y del gesto (lo lleva driveCharacter). */
  state: { base: string | null; overlay: string | null; overlayT: number; hipsY: number };
  meshes: Mesh[];
}

/** Repinta las prendas marcadas: remera y pantalón con los tokens de la apariencia (devuelve la geometría nueva). */
export function repaintClothes(geo: BufferGeometry, look: CharacterLook, seed = 0): BufferGeometry {
  const out = geo.clone();
  const ropa = out.getAttribute(ROPA_ATTRIBUTE);
  const color = out.getAttribute("color");
  const pos = out.getAttribute("position");
  if (!ropa || !color) throw new Error(`cuerpo ${look.body}: sin "_ROPA" o sin color por vértice (¿salió de scripts/assets/optimize.ts?)`);
  const n = pos.count;
  const xyz = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) xyz.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
  const shirt = paintColors(xyz, tokenRgb(look.shirt), seed + 1);
  const pants = paintColors(xyz, tokenRgb(look.pants), seed + 2);
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const slot = Math.round(ropa.getX(i));
    const src = slot === ROPA.remera ? shirt : slot === ROPA.pantalon ? pants : null;
    if (src) rgb.set(src.subarray(i * 3, i * 3 + 3), i * 3);
    else rgb.set([color.getX(i), color.getY(i), color.getZ(i)], i * 3);
  }
  out.setAttribute("color", new BufferAttribute(rgb, 3));
  return out;
}

/** Solo las pistas que mueven huesos de este esqueleto (three avisa por cada pista sin destino). */
export function clipsFor(clips: readonly AnimationClip[], bones: ReadonlyMap<string, Bone>): AnimationClip[] {
  return clips.map((c) => {
    const k = c.clone();
    k.tracks = k.tracks.filter((t) => bones.has(t.name.slice(0, t.name.lastIndexOf("."))));
    return k;
  });
}

/** El hueso `name` (nombre de KayKit) del personaje, traducido a su esqueleto. */
export const characterBone = (c: Pick<SkinnedCharacter, "bones" | "rig">, name: string): Bone | undefined => c.bones.get(boneKey(rigBoneName(c.rig, name)));

/**
 * Arma el personaje de `look` sobre la escena glTF de su cuerpo (no la modifica: clona esqueleto y malla) y los clips
 * del archivo compartido. Una malla de cuerpo, una de cabeza (o el accesorio de la cabeza) y la boca (oculta hasta que
 * habla).
 */
/**
 * `cast` (open-world-3d T7b, D-840): el juego de accesorios y la gorra del look, que necesita un esqueleto sin cabeza por
 * código (Quaternius); con KayKit no se usa.
 */
export function buildSkinnedCharacter(
  bodyScene: Object3D, clips: readonly AnimationClip[], look: CharacterLook, seed = 0, rig: RigSpec = KAYKIT_RIG, cast: AccessoryCast | null = null,
): SkinnedCharacter {
  const model = cloneSkinned(bodyScene);
  let body: SkinnedMesh | null = null;
  const bones = new Map<string, Bone>();
  model.traverse((o) => {
    if (o instanceof SkinnedMesh && !body) body = o;
    if ((o as Bone).isBone) bones.set(o.name, o as Bone);
  });
  if (!body) throw new Error(`cuerpo ${look.body}: el archivo no tiene malla con esqueleto`);
  const skinned: SkinnedMesh = body;
  const headBone = characterBone({ bones, rig }, "head");
  const hips = characterBone({ bones, rig }, "hips");
  if (!headBone || !hips) throw new Error(`cuerpo ${look.body} (${rig.id}): al esqueleto le falta "${rigBoneName(rig, "head")}" o "${rigBoneName(rig, "hips")}"`);

  skinned.geometry = repaintClothes(skinned.geometry, look, seed);
  skinned.material = toonMaterial();
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false; // la caja de la malla en reposo no sigue al esqueleto animado

  const root = new Group();
  root.add(model);
  if (!rig.codeHead) {
    if (!cast) throw new Error(`cuerpo ${look.body} (${rig.id}): sin cabeza por código hace falta el juego de accesorios del look`);
    return withAccessories(root, model, skinned, headBone, hips, bones, clips, look, seed, rig, cast);
  }
  root.scale.setScalar(rig.scale * look.scale);
  root.updateMatrixWorld(true);

  // La cabeza por código, en el marco del personaje aunque el hueso tenga escala o giro de reposo.
  const ws = headBone.getWorldScale(new Vector3()).x / root.scale.x;
  const restQ = root.getWorldQuaternion(new Quaternion()).invert().multiply(headBone.getWorldQuaternion(new Quaternion()));
  // La cabeza no proyecta sombra: el sombrero no ensombrece la cara (propuesta C §3).
  const head = new Mesh(characterHeadGeometry(look, seed), toonMaterial());
  head.receiveShadow = true;
  head.position.set(0, HEAD_OFFSET / ws, 0);
  head.quaternion.copy(restQ).invert();
  head.scale.setScalar(1 / ws);
  headBone.add(head);
  const mouth = new Mesh(mouthGeometry(), toonMaterial());
  mouth.visible = false;
  head.add(mouth);

  const mixer = new AnimationMixer(model);
  const actions = new Map<string, AnimationAction>();
  for (const clip of clipsFor(clips, bones)) actions.set(clip.name, mixer.clipAction(clip));
  return {
    root, body: skinned, head, mouth, rig, headBone, accessories: [], bones, mixer, actions,
    state: { base: null, overlay: null, overlayT: 0, hipsY: hips.position.y },
    meshes: [skinned, head, mouth],
  };
}

/** Boca del personaje de Quaternius en unidades del modelo (bajo los ojos, sobre la cara que mira a +z). */
const MODEL_MOUTH = { y: 2.08, z: 0.43 } as const;

/**
 * El personaje con la cabeza del modelo (Quaternius): los accesorios se arman en unidades del modelo, se cuelgan con
 * `attach` (conservan su lugar) antes de escalar, y la cabeza se achica como en la maqueta.
 */
function withAccessories(
  root: Group, model: Object3D, skinned: SkinnedMesh, headBone: Bone, hips: Bone, bones: Map<string, Bone>,
  clips: readonly AnimationClip[], look: CharacterLook, seed: number, rig: RigSpec, cast: AccessoryCast,
): SkinnedCharacter {
  model.updateMatrixWorld(true);
  const acc = openWorldAccessories(look, cast, seed);
  const hang = (geo: BufferGeometry | null, bone: Bone | undefined): Mesh | null => {
    if (!geo || !bone) return null;
    const m = new Mesh(geo, toonMaterial());
    m.receiveShadow = true;
    model.add(m);
    bone.attach(m);
    return m;
  };
  const head = hang(acc.head ?? new BufferGeometry(), headBone) as Mesh;
  if (!acc.head) {
    head.visible = false;
    head.userData["hidden"] = true; // sin sombrero: la regla de distancia no la prende
  }
  const neck = hang(acc.neck, characterBone({ bones, rig }, "neck"));
  // La boca: la misma de head.ts (centrada en una cabeza de radio 0,42), corrida a la cara del modelo.
  const mouth = new Mesh(mouthGeometry(), toonMaterial());
  mouth.position.set(0, MODEL_MOUTH.y + 0.2, MODEL_MOUTH.z - 0.392);
  mouth.visible = false;
  model.add(mouth);
  headBone.attach(mouth);
  headBone.scale.setScalar(rig.headScale);
  root.scale.setScalar(rig.scale * look.scale);
  root.updateMatrixWorld(true);

  const mixer = new AnimationMixer(model);
  const actions = new Map<string, AnimationAction>();
  for (const clip of clipsFor(clips, bones)) actions.set(clip.name, mixer.clipAction(clip));
  const accessories = [head, ...(neck ? [neck] : [])];
  return {
    root, body: skinned, head, mouth, rig, headBone, accessories, bones, mixer, actions,
    state: { base: null, overlay: null, overlayT: 0, hipsY: hips.position.y },
    meshes: [skinned, ...accessories, mouth],
  };
}

const fileClip = (rig: RigSpec, id: ClipId): { clip: string; loop: boolean } | null => {
  const s = rig.manifest[id];
  return s.kind === "archivo" ? { clip: s.clip, loop: s.loop } : null;
};
const isProcedural = (id: string): id is ProceduralGesture => (PROCEDURAL_GESTURES as readonly string[]).includes(id);

const qa = new Quaternion();
const qb = new Quaternion();
const qc = new Quaternion();
const qd = new Quaternion();
const va = new Vector3();
const vb = new Vector3();
const euler = new Euler();

/** Lleva el hueso a apuntar a `dir` (espacio del personaje) con peso `w`, desde la pose que dejó el clip. */
function aimBone(c: SkinnedCharacter, bone: Bone, dir: readonly [number, number, number], w: number): void {
  const child = bone.children.find((o) => (o as Bone).isBone);
  if (!child || child.position.lengthSq() < 1e-10) return;
  const rootInv = c.root.getWorldQuaternion(qc).invert();
  const boneQ = qa.copy(rootInv).multiply(bone.getWorldQuaternion(qb)); // giro del hueso en el espacio del personaje
  const from = va.copy(child.position).normalize().applyQuaternion(boneQ);
  const to = vb.set(dir[0], dir[1], dir[2]).normalize();
  const delta = qb.setFromUnitVectors(from, to);
  const target = delta.multiply(boneQ); // giro deseado en el espacio del personaje
  const parentQ = bone.parent ? c.root.getWorldQuaternion(qc).invert().multiply(bone.parent.getWorldQuaternion(qd)) : qc.identity();
  const local = parentQ.invert().multiply(target);
  bone.quaternion.slerp(local, w);
  bone.updateMatrixWorld(true);
}

function applyGesture(c: SkinnedCharacter, id: ProceduralGesture, t: number): void {
  const p = gesturePose(id, t);
  if (p.weight <= 0) return;
  c.root.updateMatrixWorld(true);
  for (const [name, dir] of Object.entries(p.aim)) {
    const bone = characterBone(c, name);
    if (bone) aimBone(c, bone, dir, p.weight);
  }
  for (const [name, r] of Object.entries(p.turn)) {
    const bone = characterBone(c, name);
    if (bone) bone.quaternion.multiply(qa.setFromEuler(euler.set(r[0] * p.weight, r[1] * p.weight, r[2] * p.weight)));
  }
}

function play(c: SkinnedCharacter, clip: string, loop: boolean, fade: number): AnimationAction | null {
  const a = c.actions.get(clip);
  if (!a) return null;
  a.reset();
  a.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
  a.clampWhenFinished = !loop;
  a.fadeIn(fade).play();
  return a;
}

/**
 * Un cuadro del personaje: cruza al clip de base que eligió la máquina, arranca o sigue el gesto, avanza el mezclador
 * (solo si `animate`: los congelados conservan su última pose) y mueve la boca. `t` es el reloj, para la boca.
 */
export function driveCharacter(c: SkinnedCharacter, choice: AnimChoice, dt: number, t: number, animate: boolean, cut: boolean): void {
  const s = c.state;
  const fade = cut ? 0 : CROSSFADE;
  // Un gesto de archivo (dar algo) es de cuerpo entero: mientras dura, reemplaza al clip de base en vez de promediarse.
  const fileOverlay = choice.overlay ? fileClip(c.rig, choice.overlay) : null;
  if (choice.overlay !== s.overlay) {
    const prev = s.overlay ? fileClip(c.rig, s.overlay as ClipId) : null;
    if (prev) c.actions.get(prev.clip)?.fadeOut(fade);
    if (fileOverlay) play(c, fileOverlay.clip, fileOverlay.loop, fade);
    s.overlay = choice.overlay;
    s.overlayT = 0;
  }
  const wantBase = fileOverlay ? null : (fileClip(c.rig, choice.base)?.clip ?? null);
  if (s.base !== wantBase) {
    if (s.base) c.actions.get(s.base)?.fadeOut(fade);
    if (wantBase) play(c, wantBase, true, fade);
    s.base = wantBase;
  }
  const baseAction = s.base ? c.actions.get(s.base) : undefined;
  if (baseAction) baseAction.timeScale = choice.rate;
  s.overlayT += dt;
  c.mouth.visible = choice.mouth;
  if (choice.mouth) c.mouth.scale.y = 0.35 + 0.65 * Math.abs(Math.sin(t * 11));
  if (!animate) return;
  c.mixer.update(dt);
  if (c.rig.headScale !== 1) c.headBone.scale.setScalar(c.rig.headScale); // un clip con escala en la cabeza no la agranda
  if (s.overlay && isProcedural(s.overlay)) applyGesture(c, s.overlay, s.overlayT);
  if (choice.bounce === 0) {
    const hips = characterBone(c, "hips");
    if (hips) hips.position.y = s.hipsY;
  }
}

/** Libera lo propio del personaje (la geometría repintada y la cabeza; los clips y el material son compartidos). */
export function disposeSkinnedCharacter(c: SkinnedCharacter): void {
  c.mixer.stopAllAction();
  c.mixer.uncacheRoot(c.mixer.getRoot());
  for (const m of c.meshes) m.geometry.dispose();
  // Open-world-3d M3 (fuga al cambiar de tier, medida con perf:probe): la textura de huesos del esqueleto (16 × 16 en la
  // GPU) no se liberaba; cada cambio de tier, que rearma los personajes, dejaba las viejas.
  c.body.skeleton.dispose();
}

