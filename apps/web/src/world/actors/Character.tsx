// world/actors/Character.tsx — un personaje en el mundo (plan estetica-c M1 ítem 13 y M3). Se ve con el cuerpo con
// esqueleto del pipeline (skinned.ts) en cuanto bajan su cuerpo base y los clips; mientras tanto, o si fallan, con el
// cuerpo de cápsulas de reserva (chibiModel.ts), con la misma cabeza. Cada cuadro, en useFrame y mutando refs (03 §2.3,
// R7): la pose (posición, giro suave hacia donde mira), la elección de animState.ts (velocidad, papel en la escena,
// gesto pedido, "reducir movimiento") y, si el gobernador lo deja, el avance de la animación. Deja su lugar en
// `actorSpots` para la sombra blob y el gobernador. Con `onSelect`, el clic sobre el cuerpo llega por el bridge (F2).
// Plan estetica-c M5: la apariencia llega por props (la de cada vecino sale de su ficha de contenido). Plan estetica-c M6:
// `lod` elige el cuerpo completo o el simplificado de `low`. Open-world-3d T7 (AC47): `rig` elige el esqueleto (KayKit o
// el de Quaternius del mundo abierto) y, con `distanceRules`, un NPC fuera del encuadre o a más de 62 m no se dibuja y a
// más de 28 m pierde los accesorios (rigs.ts).
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Frustum, Matrix4, Sphere, Vector3, type Camera, type Object3D } from "three";
import type { SceneDensity } from "@lg/art";
import { actorSpots, actorY, animatedActors } from "../runtime";
import { chooseAnimation, type GestureId, type SceneRole } from "./animState";
import { loadCharacterAssets } from "./characterAssets";
import { applyChibiPose, buildChibi, chibiPose, disposeChibi } from "./chibiModel";
import { gestureDone, PROCEDURAL_GESTURES, type ProceduralGesture } from "./gestures";
import type { CharacterLook } from "./looks";
import { npcDistanceRule, RIGS, type RigId } from "./rigs";
import { buildSkinnedCharacter, disposeSkinnedCharacter, driveCharacter, type SkinnedCharacter } from "./skinned";

export interface ActorPose {
  x: number;
  z: number;
  /** m/s (para el ritmo del paso). */
  speed: number;
  /** Hacia dónde mirar (radianes, 0 = +z); null = sigue mirando a donde miraba. */
  yaw: number | null;
}

interface Props {
  id: string;
  look: CharacterLook;
  /** La pose de este cuadro; se llama dentro de useFrame. */
  pose: (dtSec: number) => ActorPose;
  /** "Reducir movimiento": el giro corta en vez de suavizarse y el rebote baja a cero. */
  cut: boolean;
  /** Su papel en la escena en curso (habla, escucha o ninguno). */
  scene?: SceneRole;
  /** Gesto pedido: arranca cuando cambia a no nulo y termina solo (los que duran, mientras se lo pida). */
  gesture?: GestureId | null;
  onSelect?: (e: ThreeEvent<MouseEvent>) => void;
  initialYaw?: number;
  /** Densidad del tier: el cuerpo completo o el simplificado de `low` (plan estetica-c M6). */
  lod?: SceneDensity;
  /** El esqueleto (open-world-3d T7): KayKit en los dioramas planos, Quaternius en el mundo abierto. */
  rig?: RigId;
  /** NPC del mundo abierto: se oculta fuera del encuadre o lejos, y sin accesorios de lejos (AC47). */
  distanceRules?: boolean;
}

/** Centro y radio de la esfera del personaje para el encuadre (m, sobre sus pies). */
const BOUND_Y = 1;
const BOUND_R = 1.4;
const frustum = new Frustum();
const projView = new Matrix4();
const sphere = new Sphere();
const center = new Vector3();

/** Aplica la regla de distancia de un NPC del mundo abierto a su raíz y sus accesorios. */
function applyDistanceRule(root: Object3D, accessories: readonly Object3D[], camera: Camera): void {
  center.set(root.position.x, root.position.y + BOUND_Y, root.position.z);
  projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projView);
  const rule = npcDistanceRule(camera.position.distanceTo(center), frustum.intersectsSphere(sphere.set(center, BOUND_R)));
  root.visible = rule.visible;
  for (const a of accessories) if (a.userData["hidden"] !== true) a.visible = rule.accessories;
}

/** Velocidad de referencia del cuerpo de cápsulas (la del jugador del núcleo). */
const WALK_SPEED = 3.5;
/** Duración de "dar algo" (clip de archivo de una vez). */
const FILE_GESTURE_SEC = 1.6;

const seedOf = (id: string): number => {
  let h = 0;
  for (const ch of id) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  return Math.abs(h) % 1000;
};

const isProcedural = (g: string): g is ProceduralGesture => (PROCEDURAL_GESTURES as readonly string[]).includes(g);

export function Character({ id, look, pose, cut, scene = null, gesture = null, onSelect, initialYaw = Math.PI / 4, lod = "full", rig = "kaykit", distanceRules = false }: Props) {
  const seed = useMemo(() => seedOf(id), [id]);
  const chibi = useMemo(() => buildChibi(look, seed), [look, seed]);
  const [skinned, setSkinned] = useState<SkinnedCharacter | null>(null);
  useEffect(() => () => {
    disposeChibi(chibi);
    actorSpots.delete(id);
  }, [chibi, id]);
  useEffect(() => {
    let alive = true;
    setSkinned(null);
    loadCharacterAssets(look.body, lod, RIGS[rig])
      .then((a) => {
        if (!alive) return;
        setSkinned(buildSkinnedCharacter(a.body, a.clips, look, seed, RIGS[rig]));
      })
      .catch((err: unknown) => {
        // Se queda con el cuerpo de cápsulas, pero no en silencio: el aviso nombra el cuerpo que no bajó.
        console.warn(`personaje ${id}: no se pudo cargar el cuerpo "${look.body}", queda el de cápsulas`, err);
      });
    return () => {
      alive = false;
    };
  }, [look, seed, id, lod, rig]);
  // Open-world-3d M3 (fuga al cambiar de tier): se libera el cuerpo cuando deja de ser el dibujado, no en la limpieza de
  // la carga. Liberado ahí, el cuerpo viejo seguía en la escena hasta el próximo commit, three rearmaba su textura de
  // huesos en ese cuadro y quedaba viva (4 texturas de 16 × 16 por cambio de tier, medido con la sonda).
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
