// world/actors/clips.ts — el manifiesto de animaciones de los personajes (plan estetica-c M3, propuesta C §3). Puro (sin
// three). Esqueleto de destino: KayKit Rig_Medium 1.0 (el de los cuerpos y el archivo de clips del pipeline, decisión del
// manager 2026-10-13). Cada clip del set mínimo es o un clip de archivo (KayKit, servido en `animaciones.glb`) o un gesto
// procedural (gestures.ts) sobre huesos con nombre; un test lee el archivo servido y los esqueletos de los tres cuerpos y
// falla si un clip falta o si un hueso no existe.
// M3 SEAM: los clips retargeteados de Quaternius UAL 2 (o de KayKit Character Animations 2.0, diferido al operador)
// entran cambiando una fila de procedural a archivo, previa validación de huesos en scripts/assets/.
import { GESTURES, type ProceduralGesture } from "./gestures";

/** Archivo de clips del pipeline (`modelo/` + esto = el asset servido). */
export const CLIPS_ASSET = "kaykit-adventurers-1/animaciones";
/** Cuerpo base `id` → asset servido (en @lg/art desde M5: el estimador de validate:content lo usa igual). */
export { bodyAsset } from "@lg/art";

/** Las 41 articulaciones de Rig_Medium 1.0 (nombres del glTF). */
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

/** El set mínimo de la propuesta C §3 (más `escuchar`, el estado "turno del jugador" de la escena). */
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
 * De dónde sale cada clip. Los de KayKit se usan donde existen (idle con respiración, caminar con rebote, trote, sentarse
 * y dar algo); asentir y negar van sobre el hueso de la cabeza; lo demás son gestos aditivos de brazos y cabeza.
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

/** Nombres de los clips que se leen del archivo. */
export const FILE_CLIPS: readonly string[] = [...new Set(Object.values(CLIP_MANIFEST).flatMap((s) => (s.kind === "archivo" ? [s.clip] : [])))];
