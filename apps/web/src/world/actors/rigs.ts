// world/actors/rigs.ts — los dos esqueletos de personaje (open-world-3d T7, AC47). Puro (sin three).
// · kaykit: los tres cuerpos de KayKit (plan estetica-c M3) con la cabeza por código; los dioramas planos (campesino).
// · quaternius: el personaje de Quaternius de la maqueta V6 (un cuerpo con pelo y cara, del mismo pipeline m7:
//   scripts/assets/characters.ts), para el jugador y los NPCs del mundo abierto. Sin cabeza por código: el sombrero, la
//   gorra roja y la bufanda son accesorios por código colgados de los huesos (accessories.ts).
// Los gestos procedurales nombran huesos de KayKit; `bones` los traduce a los de cada esqueleto.
// T7 SEAM: el estimador de validate:content (packages/content-schema/src/compile/dioramas.ts) sigue contando el cuerpo
// de KayKit y la cabeza por código también en el mundo abierto (3.148 + cabeza contra 3.264 + accesorios: menos de 5 %
// de diferencia); pasa a leer este esqueleto cuando el contenido declare el mundo abierto. El ritmo de Walk y Run sigue
// el `rate` de animState.ts (calibrado para KayKit); la maqueta usa velocidad / 1,75 y / 4,2 (T9 afina el paso).
import {
  bodyAsset, CHARACTER_RIGS, OPEN_WORLD_BODY_ASSET, OPEN_WORLD_CLIPS_ASSET, REDUCED_BODY_SUFFIX, type CharacterRig, type SceneDensity,
  type WorldLook,
} from "@lg/art";
import { CLIP_MANIFEST, CLIPS_ASSET, type ClipId, type ClipSource } from "./clips";
import { GESTURES } from "./gestures";
import type { BodyId } from "./looks";

/** Los esqueletos: los ids son los de @lg/art (un look nombra el suyo en `characters.rig`). */
export const RIG_IDS = CHARACTER_RIGS;
export type RigId = CharacterRig;

export interface RigSpec {
  id: RigId;
  /** El cuerpo servido de una apariencia y un tier (asset sin `modelo/`). */
  bodyAsset: (body: BodyId, lod: SceneDensity) => string;
  clipsAsset: string;
  manifest: Readonly<Record<ClipId, ClipSource>>;
  /** Hueso con nombre de KayKit (el de los gestos y la cadera) → el de este esqueleto. */
  bones: Readonly<Record<string, string>>;
  /** Escala del personaje (por la de su apariencia). */
  scale: number;
  /** Escala del hueso de la cabeza en cada cuadro (la maqueta achica la cabeza de Quaternius). */
  headScale: number;
  /** Cabeza por código (head.ts) o la del modelo con accesorios. */
  codeHead: boolean;
}

export const KAYKIT_RIG: RigSpec = {
  id: "kaykit",
  bodyAsset: (body, lod) => bodyAsset(body, lod),
  clipsAsset: CLIPS_ASSET,
  manifest: CLIP_MANIFEST,
  bones: {},
  scale: 1.1,
  headScale: 1,
  codeHead: true,
};

const file = (clip: string, loop = true): ClipSource => ({ kind: "archivo", asset: OPEN_WORLD_CLIPS_ASSET, clip, loop });

/**
 * Los clips de Quaternius: Idle, Walk, Run y PickUp. No trae sentarse: queda en Idle (desvío registrado de T7); "dar"
 * usa PickUp. Los gestos procedurales son los mismos, sobre los huesos traducidos.
 */
export const QUATERNIUS_MANIFEST: Readonly<Record<ClipId, ClipSource>> = {
  ...CLIP_MANIFEST,
  idle: file("Idle"),
  caminar: file("Walk"),
  trotar: file("Run"),
  sentarse: file("Idle"),
  dar: file("PickUp", false),
};

export const QUATERNIUS_RIG: RigSpec = {
  id: "quaternius",
  bodyAsset: (_body, lod) => `${OPEN_WORLD_BODY_ASSET}${lod === "reduced" ? REDUCED_BODY_SUFFIX : ""}`,
  clipsAsset: OPEN_WORLD_CLIPS_ASSET,
  manifest: QUATERNIUS_MANIFEST,
  bones: {
    root: "Root", hips: "Hips", spine: "Abdomen", chest: "Torso", neck: "Neck", head: "Head",
    "upperarm.l": "UpperArm.L", "lowerarm.l": "LowerArm.L", "hand.l": "Fist.L",
    "upperarm.r": "UpperArm.R", "lowerarm.r": "LowerArm.R", "hand.r": "Fist.R",
    "upperleg.l": "UpperLeg.L", "lowerleg.l": "LowerLeg.L", "foot.l": "Foot.L",
    "upperleg.r": "UpperLeg.R", "lowerleg.r": "LowerLeg.R", "foot.r": "Foot.R",
  },
  // La maqueta V6: modelo a 0,665 y cabeza a 0,74 (mide ~1,9 m con la gorra).
  scale: 0.665,
  headScale: 0.74,
  codeHead: false,
};

export const RIGS: Readonly<Record<RigId, RigSpec>> = { kaykit: KAYKIT_RIG, quaternius: QUATERNIUS_RIG };

/** El nombre del hueso `name` (de KayKit) en el esqueleto de `rig`. */
export const rigBoneName = (rig: RigSpec, name: string): string => rig.bones[name] ?? name;

/** Los huesos que mueve el manifiesto de `rig` (para el test de huesos que existen). */
export function rigManifestBones(rig: RigSpec): string[] {
  const out = new Set<string>(["hips", "head"]);
  for (const s of Object.values(rig.manifest)) if (s.kind === "procedural") for (const b of GESTURES[s.gesture].bones) out.add(b);
  return [...out].map((b) => rigBoneName(rig, b));
}

/** Un NPC del mundo abierto más lejos que esto (o fuera del encuadre) no se dibuja (AC47). */
export const NPC_HIDE_M = 62;
/** Más lejos que esto, sin accesorios (~40 px de alto en pantalla, maqueta V6). */
export const NPC_ACCESSORY_M = 28;

/** Qué se ve de un NPC del mundo abierto a `distance` m de la cámara. */
export function npcDistanceRule(distance: number, inFrustum: boolean): { visible: boolean; accessories: boolean } {
  const visible = inFrustum && distance <= NPC_HIDE_M;
  return { visible, accessories: visible && distance <= NPC_ACCESSORY_M };
}

/**
 * El esqueleto de los personajes de un diorama: el de su look (open-world-3d T7b, D-840, LK3 enmendado). Hasta 0034931
 * salía del relieve (`actorRig(relief)`); ahora `relieve` decide solo la forma del terreno. Es la única elección del
 * esqueleto: Character la llama con los personajes del look (`cast`); sin ellos (tests, retrato), KayKit.
 */
export const actorRig = (cast: WorldLook["characters"] | null | undefined): RigId => cast?.rig ?? "kaykit";
