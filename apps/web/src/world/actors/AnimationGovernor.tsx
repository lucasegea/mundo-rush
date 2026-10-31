// world/actors/AnimationGovernor.tsx — the cap on animated characters per tier (plan estetica-c M3, `maxAnimatedCharacters`
// of TIER_PARAMS): every frame, before the characters (negative priority: it never takes the render), it looks at where
// each one is in `actorSpots`, whether it falls inside the camera and at what distance, and leaves in `animatedActors` the closest
// on-screen ones up to the cap (animState.pickAnimated). The rest keep their last pose. Plan estetica-c M6 (03 §2.7.4):
// during the chat `only` lets just the player and the scene's NPC animate.
import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { Frustum, Matrix4, Sphere, Vector3 } from "three";
import { actorSpots, animatedActors } from "../runtime";
import { pickAnimated, type AnimCandidate } from "./animState";

const frustum = new Frustum();
const m = new Matrix4();
const sphere = new Sphere(new Vector3(), 1.4);

export function AnimationGovernor({ max, only = null }: { max: number; only?: ReadonlySet<string> | null }) {
  useEffect(() => {
    animatedActors.active = true;
    return () => {
      animatedActors.active = false;
      animatedActors.ids.clear();
    };
  }, []);
  useFrame(({ camera }) => {
    frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const entries: AnimCandidate[] = [];
    for (const [id, spot] of actorSpots) {
      // Over the feet (spot.y): with the open world's relief a fixed height leaves the sphere underground and, up close,
      // out of frame, and the character slid around frozen.
      sphere.center.set(spot.x, spot.y + 1.1, spot.z);
      entries.push({ id, distance: camera.position.distanceTo(sphere.center), onScreen: frustum.intersectsSphere(sphere) });
    }
    animatedActors.ids = pickAnimated(entries, max, only);
  }, -1);
  return null;
}
