// world/actors/rigs.ts — the two character skeletons (open-world-3d T7, AC47). Pure (no three).
// · kaykit: the three KayKit bodies (plan estetica-c M3) with the code-built head; the flat dioramas (farmer).
// · quaternius: the Quaternius character from the V6 diorama (one body with hair and face, from the same m7 pipeline:
//   scripts/assets/characters.ts), for the player and the open world's NPCs. No code-built head: the hat, the
//   red cap and the scarf are code-built accessories hung from the bones (accessories.ts).
// The procedural gestures name KayKit bones; `bones` translates them to each skeleton's.
// T7 SEAM: the validate:content estimator (packages/content-schema/src/compile/dioramas.ts) still counts the KayKit body
// and the code-built head in the open world too (3,148 + head against 3,264 + accessories: less than 5 %
// difference); it switches to reading this skeleton when the content declares the open world. The Walk and Run rhythm still follows
// the `rate` of animState.ts (calibrated for KayKit); the diorama uses speed / 1.75 and / 4.2 (T9 tunes the stride).
import {
  bodyAsset, CHARACTER_RIGS, OPEN_WORLD_BODY_ASSET, OPEN_WORLD_CLIPS_ASSET, REDUCED_BODY_SUFFIX, type CharacterRig, type SceneDensity,
  type WorldLook,
} from "@lg/art";
import { CLIP_MANIFEST, CLIPS_ASSET, type ClipId, type ClipSource } from "./clips";
import { GESTURES } from "./gestures";
import type { BodyId } from "./looks";

/** The skeletons: the ids are @lg/art's (a look names its own in `characters.rig`). */
export const RIG_IDS = CHARACTER_RIGS;
export type RigId = CharacterRig;

export interface RigSpec {
  id: RigId;
  /** The served body for an appearance and a tier (asset without `modelo/`). */
  bodyAsset: (body: BodyId, lod: SceneDensity) => string;
  clipsAsset: string;
  manifest: Readonly<Record<ClipId, ClipSource>>;
  /** KayKit-named bone (the gestures' and the hip's) → this skeleton's. */
  bones: Readonly<Record<string, string>>;
  /** Character scale (by its appearance's). */
  scale: number;
  /** Scale of the head bone each frame (the diorama shrinks Quaternius's head). */
  headScale: number;
  /** Code-built head (head.ts) or the model's with accessories. */
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
 * Quaternius's clips: Idle, Walk, Run and PickUp. It has no sit: it stays at Idle (registered deviation of T7); "give"
 * uses PickUp. The procedural gestures are the same, on the translated bones.
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
  // The V6 diorama: model at 0.665 and head at 0.74 (measures ~1.9 m with the cap).
  scale: 0.665,
  headScale: 0.74,
  codeHead: false,
};

export const RIGS: Readonly<Record<RigId, RigSpec>> = { kaykit: KAYKIT_RIG, quaternius: QUATERNIUS_RIG };

/** The name of bone `name` (KayKit's) in the skeleton of `rig`. */
export const rigBoneName = (rig: RigSpec, name: string): string => rig.bones[name] ?? name;

/** The bones the manifest of `rig` moves (for the test that bones exist). */
export function rigManifestBones(rig: RigSpec): string[] {
  const out = new Set<string>(["hips", "head"]);
  for (const s of Object.values(rig.manifest)) if (s.kind === "procedural") for (const b of GESTURES[s.gesture].bones) out.add(b);
  return [...out].map((b) => rigBoneName(rig, b));
}

/** An open-world NPC farther than this (or off-frame) is not drawn (AC47). */
export const NPC_HIDE_M = 62;
/** Farther than this, no accessories (~40 px tall on screen, V6 diorama). */
export const NPC_ACCESSORY_M = 28;

/** What shows of an open-world NPC at `distance` m from the camera. */
export function npcDistanceRule(distance: number, inFrustum: boolean): { visible: boolean; accessories: boolean } {
  const visible = inFrustum && distance <= NPC_HIDE_M;
  return { visible, accessories: visible && distance <= NPC_ACCESSORY_M };
}

/**
 * The skeleton of a diorama's characters: its look's (open-world-3d T7b, D-840, LK3 amended). Up to 0034931
 * it came from the relief (`actorRig(relief)`); now `relieve` decides only the terrain's shape. It is the only skeleton
 * choice: Character calls it with the look's characters (`cast`); without them (tests, portrait), KayKit.
 */
export const actorRig = (cast: WorldLook["characters"] | null | undefined): RigId => cast?.rig ?? "kaykit";
