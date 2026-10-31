// world/actors/Character.tsx — a character in the world (plan estetica-c M1 item 13 and M3). It shows with the skeleton
// body from the pipeline (skinned.ts) as soon as its base body and clips download; meanwhile, or if they fail, with the
// fallback capsule body (chibiModel.ts), with the same head. Every frame, in useFrame and mutating refs (03 §2.3,
// R7): the pose (position, smooth turn toward where it looks), the animState.ts choice (speed, role in the scene,
// requested gesture, "reduce motion") and, if the governor allows it, the animation advance. It leaves its spot in
// `actorSpots` for the blob shadow and the governor. With `onSelect`, a click on the body arrives through the bridge (F2).
// Plan estetica-c M5: the appearance arrives via props (each neighbor's comes from its content sheet). Plan estetica-c M6:
// `lod` picks the full body or the simplified `low` one. Open-world-3d T7 (AC47): `rig` picks the skeleton (KayKit or
// the open world's Quaternius one) and, with `distanceRules`, an NPC off-frame or farther than 62 m is not drawn and at
// more than 28 m loses its accessories (rigs.ts). T10-integrate: the skeleton body is precompiled before being swapped in.
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Frustum, Matrix4, Sphere, Vector3, type Camera, type Object3D } from "three";
import type { SceneDensity, WorldLook } from "@lg/art";
import { usePrecompile } from "../budget/WorldLoad";
import { actorSpots, actorY, animatedActors } from "../runtime";
import { chooseAnimation, type GestureId, type SceneRole } from "./animState";
import { loadCharacterAssets } from "./characterAssets";
import { applyChibiPose, buildChibi, chibiPose, disposeChibi } from "./chibiModel";
import { gestureDone, PROCEDURAL_GESTURES, type ProceduralGesture } from "./gestures";
import type { CharacterLook } from "./looks";
import { actorRig, npcDistanceRule, RIGS, type RigId } from "./rigs";
import { buildSkinnedCharacter, disposeSkinnedCharacter, driveCharacter, type SkinnedCharacter } from "./skinned";

export interface ActorPose {
  x: number;
  z: number;
  /** m/s (for the stride rhythm). */
  speed: number;
  /** Where to look (radians, 0 = +z); null = keep looking where it was looking. */
  yaw: number | null;
}

interface Props {
  id: string;
  look: CharacterLook;
  /** This frame's pose; called inside useFrame. */
  pose: (dtSec: number) => ActorPose;
  /** "Reduce motion": the turn snaps instead of smoothing and the bounce drops to zero. */
  cut: boolean;
  /** Its role in the current scene (talks, listens or none). */
  scene?: SceneRole;
  /** Requested gesture: starts when it changes to non-null and ends by itself (sustained ones, while it is requested). */
  gesture?: GestureId | null;
  onSelect?: (e: ThreeEvent<MouseEvent>) => void;
  initialYaw?: number;
  /** Tier density: the full body or the simplified `low` one (plan estetica-c M6). */
  lod?: SceneDensity;
  /**
   * Open-world-3d T7b (D-840): the characters of the diorama look (skeleton, accessory set, cap). Without it,
   * KayKit with the code-built head (the tests and the portrait).
   */
  cast?: WorldLook["characters"] | null;
  /** Open-world NPC: hidden off-frame or far away, and without accessories from afar (AC47). */
  distanceRules?: boolean;
}

/** Center and radius of the character's sphere for framing (m, over its feet). */
const BOUND_Y = 1;
const BOUND_R = 1.4;
const frustum = new Frustum();
const projView = new Matrix4();
const sphere = new Sphere();
const center = new Vector3();

/** Applies the distance rule of an open-world NPC to its root and its accessories. */
function applyDistanceRule(root: Object3D, accessories: readonly Object3D[], camera: Camera): void {
  center.set(root.position.x, root.position.y + BOUND_Y, root.position.z);
  projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projView);
  const rule = npcDistanceRule(camera.position.distanceTo(center), frustum.intersectsSphere(sphere.set(center, BOUND_R)));
  root.visible = rule.visible;
  for (const a of accessories) if (a.userData["hidden"] !== true) a.visible = rule.accessories;
}

/** Reference speed of the capsule body (the core player's). */
const WALK_SPEED = 3.5;
/** Duration of "give something" (one-shot archive clip). */
const FILE_GESTURE_SEC = 1.6;

const seedOf = (id: string): number => {
  let h = 0;
  for (const ch of id) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  return Math.abs(h) % 1000;
};

const isProcedural = (g: string): g is ProceduralGesture => (PROCEDURAL_GESTURES as readonly string[]).includes(g);

export function Character({ id, look, pose, cut, scene = null, gesture = null, onSelect, initialYaw = Math.PI / 4, lod = "full", cast = null, distanceRules = false }: Props) {
  // LK3 (amendment): the skeleton comes only from the look's characters, never from distanceRules, the relief or the open world.
  const rig: RigId = actorRig(cast);
  const seed = useMemo(() => seedOf(id), [id]);
  const chibi = useMemo(() => buildChibi(look, seed), [look, seed]);
  const [skinned, setSkinned] = useState<SkinnedCharacter | null>(null);
  const precompile = usePrecompile();
  useEffect(() => () => {
    disposeChibi(chibi);
    actorSpots.delete(id);
  }, [chibi, id]);
  useEffect(() => {
    let alive = true;
    setSkinned(null);
    loadCharacterAssets(look.body, lod, RIGS[rig])
      .then(async (a) => {
        if (!alive) return;
        const built = buildSkinnedCharacter(a.body, a.clips, look, seed, RIGS[rig], cast);
        // T10-integrate: the body is swapped in when its programs have already compiled (meanwhile, the capsule one stays), so
        // its first frame does not compile mid-game. precompile never rejects nor holds back the frameloop.
        await precompile(built.root);
        if (alive) setSkinned(built);
        else disposeSkinnedCharacter(built);
      })
      .catch((err: unknown) => {
        // It keeps the capsule body, but not silently: the warning names the body that did not download.
        console.warn(`personaje ${id}: no se pudo cargar el cuerpo "${look.body}", queda el de cápsulas`, err);
      });
    return () => {
      alive = false;
    };
  }, [look, seed, id, lod, rig, cast, precompile]);
  // Open-world-3d M3 (leak on tier change): the body is released when it stops being the drawn one, not in the cleanup of
  // the load. Released there, the old body stayed in the scene until the next commit, three rebuilt its bone texture in
  // that frame and it was left alive (4 textures of 16 × 16 per tier change, measured with the probe).
  useEffect(() => () => {
    if (skinned) disposeSkinnedCharacter(skinned);
  }, [skinned]);

  const phase = useRef(0);
  const yaw = useRef(initialYaw);
  const active = useRef<{ id: GestureId; t: number } | null>(null);
  useEffect(() => {
    active.current = gesture ? { id: gesture, t: 0 } : null;
  }, [gesture]);

  useFrame(({ clock, camera }, delta) => {
    const p = pose(delta);
    const root = skinned ? skinned.root : chibi.root;
    const y = actorY(p.x, p.z);
    root.position.set(p.x, y, p.z);
    if (p.yaw !== null) {
      const d = Math.atan2(Math.sin(p.yaw - yaw.current), Math.cos(p.yaw - yaw.current));
      yaw.current += cut ? d : d * (1 - Math.exp(-10 * delta));
    }
    root.rotation.y = yaw.current;
    actorSpots.set(id, { x: p.x, y, z: p.z });
    if (distanceRules) {
      root.updateMatrix();
      applyDistanceRule(root, skinned ? skinned.accessories : [], camera);
    }

    const g = active.current;
    if (g) {
      g.t += delta;
      if (isProcedural(g.id) ? gestureDone(g.id, g.t) : g.t >= FILE_GESTURE_SEC) active.current = null;
    }
    const choice = chooseAnimation({ speed: p.speed, reduceMotion: cut, scene, gesture: active.current?.id ?? null });
    const animate = !animatedActors.active || animatedActors.ids.has(id);
    if (skinned) {
      driveCharacter(skinned, choice, delta, clock.elapsedTime, animate, cut);
      return;
    }
    if (!animate) return;
    const speed01 = Math.min(1, p.speed / WALK_SPEED);
    phase.current += delta * (speed01 > 0.05 ? 9 * Math.max(0.6, speed01) : 2);
    applyChibiPose(chibi, chibiPose(phase.current, speed01, clock.elapsedTime + id.length, choice.bounce));
  });

  return <primitive object={skinned ? skinned.root : chibi.root} {...(onSelect ? { onClick: onSelect } : {})} />;
}
