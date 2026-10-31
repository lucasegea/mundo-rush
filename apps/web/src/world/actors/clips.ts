// world/actors/clips.ts — the characters' animation manifest (plan estetica-c M3, proposal C §3). Pure (no
// three). Target skeleton: KayKit Rig_Medium 1.0 (the one from the pipeline's bodies and clip file, manager decision
// 2026-10-13). Each clip in the minimal set is either a file clip (KayKit, served in `animaciones.glb`) or a procedural
// gesture (gestures.ts) on named bones; a test reads the served file and the skeletons of the three bodies and
// fails if a clip is missing or a bone does not exist.
// M3 SEAM: the retargeted clips from Quaternius UAL 2 (or KayKit Character Animations 2.0, deferred to the operator)
// come in by changing a row from procedural to file, after bone validation in scripts/assets/.
import { GESTURES, type ProceduralGesture } from "./gestures";

/** Pipeline clip file (`modelo/` + this = the served asset). */
export const CLIPS_ASSET = "kaykit-adventurers-1/animaciones";
/** Base body `id` → served asset (in @lg/art since M5: the validate:content estimator uses it just the same). */
export { bodyAsset } from "@lg/art";

/** The 41 joints of Rig_Medium 1.0 (glTF names). */
export const RIG_BONES = [
  "root", "hips", "spine", "chest", "head",
  "upperarm.l", "lowerarm.l", "wrist.l", "hand.l", "handslot.l",
  "upperarm.r", "lowerarm.r", "wrist.r", "hand.r", "handslot.r",
  "upperleg.l", "lowerleg.l", "foot.l", "toes.l",
  "upperleg.r", "lowerleg.r", "foot.r", "toes.r",
  "kneeIK.l", "heelIK.l", "IK-foot.l", "control-foot-roll.l", "IK-toe.l", "control-heel-roll.l", "control-toe-roll.l",
  "kneeIK.r", "heelIK.r", "IK-foot.r", "control-foot-roll.r", "IK-toe.r", "control-heel-roll.r", "control-toe-roll.r",
  "elbowIK.l", "handIK.l", "elbowIK.r", "handIK.r",
] as const;

/** The minimal set from proposal C §3 (plus `escuchar`, the scene's "player's turn" state). */
export const MIN_CLIP_SET = [
  "idle", "caminar", "trotar", "hablar", "escuchar", "saludar", "asentir", "negar", "pensar", "sorprenderse", "sentarse", "cargar", "dar",
] as const;
export type ClipId = (typeof MIN_CLIP_SET)[number];

export type ClipSource =
  | { kind: "archivo"; asset: string; clip: string; loop: boolean }
  | { kind: "procedural"; gesture: ProceduralGesture; bones: readonly string[] };

const file = (clip: string, loop = true): ClipSource => ({ kind: "archivo", asset: CLIPS_ASSET, clip, loop });
const procedural = (gesture: ProceduralGesture): ClipSource => ({ kind: "procedural", gesture, bones: GESTURES[gesture].bones });

/**
 * Where each clip comes from. KayKit's are used where they exist (idle with breathing, walk with bounce, trot, sit
 * and give something); nod and shake go on the head bone; the rest are additive arm and head gestures.
 */
export const CLIP_MANIFEST: Readonly<Record<ClipId, ClipSource>> = {
  idle: file("Idle"),
  caminar: file("Walking_A"),
  trotar: file("Running_A"),
  sentarse: file("Sit_Chair_Idle"),
  dar: file("Interact", false),
  hablar: procedural("hablar"),
  escuchar: procedural("escuchar"),
  saludar: procedural("saludar"),
  asentir: procedural("asentir"),
  negar: procedural("negar"),
  pensar: procedural("pensar"),
  sorprenderse: procedural("sorprenderse"),
  cargar: procedural("cargar"),
};

/** Names of the clips read from the file. */
export const FILE_CLIPS: readonly string[] = [...new Set(Object.values(CLIP_MANIFEST).flatMap((s) => (s.kind === "archivo" ? [s.clip] : [])))];
