// world/actors/AnimationGovernor.tsx — el tope de personajes animados por tier (plan estetica-c M3, `maxAnimatedCharacters`
// de TIER_PARAMS): en cada cuadro, antes que los personajes (prioridad negativa: nunca toma el render), mira dónde está
// cada uno en `actorSpots`, si cae dentro de la cámara y a qué distancia, y deja en `animatedActors` a los más cercanos
// en pantalla hasta el tope (animState.pickAnimated). Los demás conservan su última pose. Plan estetica-c M6 (03 §2.7.4):
// durante la charla `only` deja animarse solo al jugador y al NPC de la escena.
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
      sphere.center.set(spot.x, 1.1, spot.z);
      entries.push({ id, distance: camera.position.distanceTo(sphere.center), onScreen: frustum.intersectsSphere(sphere) });
    }
    animatedActors.ids = pickAnimated(entries, max, only);
  }, -1);
  return null;
}
