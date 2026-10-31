// world/actors/skinned.ts — the skeleton character (plan estetica-c M3): clones a base body from the pipeline with its own
// skeleton (SkeletonUtils), repaints shirt and trousers with its appearance's tokens (the vertices marked with
// `_ROPA` in scripts/assets/characters.ts), hangs the code-built head (head.ts, one mesh) from the `head` bone and the
// mouth, and builds the mixer with the shared clips. `driveCharacter` applies the animState.ts choice: it crossfades the
// base clips, adds the procedural gesture (gestures.ts) and, with "reduce motion", keeps the hip at its height.
// Open-world-3d T7 (AC47): the skeleton arrives as a `RigSpec` (rigs.ts). With Quaternius's there is no code-built head:
// the model ships hair and face, and the accessories (cap, hat, scarf: accessories.ts) hang from its bones.
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

/** Skeleton character scale: the head bone at 1.24 + the code-built head gives ~2.3 m (like M1's). */
export const CHARACTER_SCALE = KAYKIT_RIG.scale;
/** Center of the code-built head over the `head` bone (skeleton units). */
export const HEAD_OFFSET = 0.4;
/** Values of `_ROPA` (those of scripts/assets/characters.ts). */
export const ROPA = { fija: 0, remera: 1, pantalon: 2 } as const;
/** The `_ROPA` attribute as GLTFLoader leaves it (custom attributes go in lowercase). */
export const ROPA_ATTRIBUTE = "_ropa";
const CROSSFADE = 0.25;

/** Name of a glTF bone as GLTFLoader leaves it (`upperarm.r` → `upperarmr`). */
export const boneKey = (name: string): string => PropertyBinding.sanitizeNodeName(name);

export interface SkinnedCharacter {
  root: Group;
  body: SkinnedMesh;
  /** The code-built head (KayKit) or the head accessory (Quaternius; without a hat, a hidden empty mesh). */
  head: Mesh;
  mouth: Mesh;
  rig: RigSpec;
  headBone: Bone;
  /** The code-built accessories (Quaternius): hidden from afar (rigs.ts, NPC_ACCESSORY_M). */
  accessories: Mesh[];
  bones: ReadonlyMap<string, Bone>;
  mixer: AnimationMixer;
  actions: ReadonlyMap<string, AnimationAction>;
  /** State of the clip crossfade and the gesture (driven by driveCharacter). */
  state: { base: string | null; overlay: string | null; overlayT: number; hipsY: number };
  meshes: Mesh[];
}

/** Repaints the marked garments: shirt and trousers with the appearance's tokens (returns the new geometry). */
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

/** Only the tracks that move bones of this skeleton (three warns for each track without a target). */
export function clipsFor(clips: readonly AnimationClip[], bones: ReadonlyMap<string, Bone>): AnimationClip[] {
  return clips.map((c) => {
    const k = c.clone();
    k.tracks = k.tracks.filter((t) => bones.has(t.name.slice(0, t.name.lastIndexOf("."))));
    return k;
  });
}

/** The bone `name` (KayKit name) of the character, translated to its skeleton. */
export const characterBone = (c: Pick<SkinnedCharacter, "bones" | "rig">, name: string): Bone | undefined => c.bones.get(boneKey(rigBoneName(c.rig, name)));

/**
 * Builds the `look` character over the glTF scene of its body (does not modify it: clones skeleton and mesh) and the clips
 * from the shared file. One body mesh, one head mesh (or the head accessory) and the mouth (hidden until it
 * talks).
 */
/**
 * `cast` (open-world-3d T7b, D-840): the look's accessory set and cap, which needs a skeleton without a code-built
 * head (Quaternius); with KayKit it is not used.
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
  skinned.frustumCulled = false; // the rest-pose mesh box does not follow the animated skeleton

  const root = new Group();
  root.add(model);
  if (!rig.codeHead) {
    if (!cast) throw new Error(`cuerpo ${look.body} (${rig.id}): sin cabeza por código hace falta el juego de accesorios del look`);
    return withAccessories(root, model, skinned, headBone, hips, bones, clips, look, seed, rig, cast);
  }
  root.scale.setScalar(rig.scale * look.scale);
  root.updateMatrixWorld(true);

  // The code-built head, in the character's frame even if the bone has rest scale or rotation.
  const ws = headBone.getWorldScale(new Vector3()).x / root.scale.x;
  const restQ = root.getWorldQuaternion(new Quaternion()).invert().multiply(headBone.getWorldQuaternion(new Quaternion()));
  // The head casts no shadow: the hat does not shade the face (proposal C §3).
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

/** Quaternius character's mouth in model units (under the eyes, over the face looking toward +z). */
const MODEL_MOUTH = { y: 2.08, z: 0.43 } as const;

/**
 * The character with the model's head (Quaternius): the accessories are built in model units, hung with
 * `attach` (they keep their place) before scaling, and the head shrinks as in the diorama.
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
    head.userData["hidden"] = true; // without a hat: the distance rule does not turn it on
  }
  const neck = hang(acc.neck, characterBone({ bones, rig }, "neck"));
  // The mouth: the same as head.ts's (centered on a head of radius 0.42), shifted to the model's face.
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

/** Brings the bone to point at `dir` (character space) with weight `w`, from the pose the clip left. */
function aimBone(c: SkinnedCharacter, bone: Bone, dir: readonly [number, number, number], w: number): void {
  const child = bone.children.find((o) => (o as Bone).isBone);
  if (!child || child.position.lengthSq() < 1e-10) return;
  const rootInv = c.root.getWorldQuaternion(qc).invert();
  const boneQ = qa.copy(rootInv).multiply(bone.getWorldQuaternion(qb)); // bone rotation in character space
  const from = va.copy(child.position).normalize().applyQuaternion(boneQ);
  const to = vb.set(dir[0], dir[1], dir[2]).normalize();
  const delta = qb.setFromUnitVectors(from, to);
  const target = delta.multiply(boneQ); // desired rotation in character space
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
 * One character frame: crossfades to the base clip the machine chose, starts or continues the gesture, advances the mixer
 * (only if `animate`: frozen ones keep their last pose) and moves the mouth. `t` is the clock, for the mouth.
 */
export function driveCharacter(c: SkinnedCharacter, choice: AnimChoice, dt: number, t: number, animate: boolean, cut: boolean): void {
  const s = c.state;
  const fade = cut ? 0 : CROSSFADE;
  // A file gesture (give something) is full-body: while it lasts, it replaces the base clip instead of being averaged.
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
  if (c.rig.headScale !== 1) c.headBone.scale.setScalar(c.rig.headScale); // a clip with head scale does not enlarge it
  if (s.overlay && isProcedural(s.overlay)) applyGesture(c, s.overlay, s.overlayT);
  if (choice.bounce === 0) {
    const hips = characterBone(c, "hips");
    if (hips) hips.position.y = s.hipsY;
  }
}

/** Frees the character's own resources (the repainted geometry and the head; clips and material are shared). */
export function disposeSkinnedCharacter(c: SkinnedCharacter): void {
  c.mixer.stopAllAction();
  c.mixer.uncacheRoot(c.mixer.getRoot());
  for (const m of c.meshes) m.geometry.dispose();
  // Open-world-3d M3 (leak on tier change, measured with perf:probe): the skeleton's bone texture (16 × 16 on the
  // GPU) was not freed; each tier change, which rebuilds the characters, left the old ones behind.
  c.body.skeleton.dispose();
}

