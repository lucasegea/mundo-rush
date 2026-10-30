// world/camera/CameraRig.tsx — la ÚNICA cámara del juego (R11; lint: cámaras solo en world/camera/). Open-world-3d T5
// (D-820, PD-5): en el mapa es `thirdPerson`, detrás del personaje (FOV 50°, 74° en vertical), con el yaw y la inclinación
// del jugador y un zoom continuo de 2,5 m al mapa entero (zoom.ts): de lejos la inclinación sube a 82°, el pivote va al
// centro del mapa, la niebla y el plano lejano crecen. Se acerca si algo tapa al personaje y nunca baja del terreno
// (rig.ts `solveThirdPerson`). Yaw, inclinación y zoom se leen del store con `readGame` dentro de useFrame (D-820: nada de
// props por arrastre); todo suavizado usa el tiempo del cuadro. Con "reducir movimiento" el zoom, la inclinación y el
// pivote cortan. Durante la charla con un NPC del diorama, `dialogueFrame` (plano de a dos en 3/4 con test de oclusión,
// transición a 3/s); al volver, la tercera persona retoma el mismo yaw y el mismo t (están en el store). Avisa al store la
// distancia del mapa entero (`bridge.cameraFit`) cuando cambia el aspecto o el yaw.
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { PerspectiveCamera as PerspCam } from "three";
import type { CameraPresetId } from "@lg/core";
import { bridge } from "../../state/bridge";
import { readGame, selectCameraView, type ConversationFrame } from "../../state/selectors";
import { cameraLook, followTarget } from "../runtime";
import { cameraClip, cameraOffset, followAlpha, perspectiveFov, shortestYawDelta, solveThirdPerson, TWO_SHOT, twoShotFrame, type Obstacle } from "./rig";
import { approach, boundsCenter, fitDistance, thirdPersonFov, THIRD_PERSON_VIEW, zoomPose, zoomTAt, type Bounds } from "./zoom";

interface Props {
  preset: CameraPresetId;
  motion: "follow" | "cut";
  conversation: ConversationFrame | null;
  obstacles: readonly Obstacle[];
  heightAt: ((x: number, z: number) => number) | null;
  /** Límites caminables del diorama: el mapa entero que encuadra t = 1. */
  bounds: Bounds | null;
}

type V3 = [number, number, number];

/** Suavizados de la tercera persona (1/s), los del mockup V6. */
const RATE = { zoom: 9, pitch: 10, pivot: 16, yaw: 20, fov: 6 } as const;
/** El acercamiento por obstáculos solo vale de cerca (mockup: t < 0,35); de lejos nada tapa al personaje. */
const PULL_IN_MAX_T = 0.35;
/** Se avisa una distancia del mapa entero nueva cuando cambió más de esto (fracción). */
const FIT_REPORT_DELTA = 0.005;

interface RigState {
  logDist: number;
  pitch: number;
  yaw: number;
  pivot: V3;
  pos: V3;
  look: V3;
  fov: number;
  /** Viene de otra cámara (charla o al revés): posición y mira se acercan a 3/s hasta llegar. */
  blending: boolean;
  wasDialogue: boolean;
  fitKey: string;
  fit: number;
  reportedFit: number;
}

const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const dist3 = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function CameraRig({ preset, motion, conversation, obstacles, heightAt, bounds }: Props) {
  const cam = useRef<PerspCam>(null);
  const st = useRef<RigState | null>(null);
  const clip = useRef({ near: 0, far: 0, fov: 0 });
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const twoShot = useMemo(
    () => (preset === "dialogueFrame" && conversation ? twoShotFrame(conversation.player, conversation.npc, obstacles, heightAt ?? undefined) : null),
    [preset, conversation, obstacles, heightAt],
  );

  useFrame((_, delta) => {
    const c = cam.current;
    if (!c) return;
    const v = readGame(selectCameraView);
    const cut = motion === "cut" || v.reduceMotion;
    const ground = (x: number, z: number): number => (heightAt ? heightAt(x, z) : 0);

    // La distancia del mapa entero para el yaw del store y el aspecto; se recalcula solo si cambiaron.
    const fitKey = `${Math.round(v.yawDeg * 2)}|${aspect.toFixed(3)}|${bounds ? `${bounds.minX},${bounds.maxX},${bounds.minZ},${bounds.maxZ}` : "-"}`;
    const prev = st.current;
    const fit = prev && prev.fitKey === fitKey ? prev.fit : bounds ? fitDistance(v.yawDeg, aspect, bounds, 0) : v.fitDistance;
    const reportedFit = prev?.reportedFit ?? v.fitDistance;
    if (bounds && Math.abs(fit - reportedFit) > reportedFit * FIT_REPORT_DELTA) bridge.cameraFit(fit);

    // ---------- tercera persona ----------
    const wantDist = v.overview ? fit : Math.min(Math.max(v.zoomDistance, THIRD_PERSON_VIEW.minDistance), fit);
    const first = !prev || !followTarget.ready;
    const logDist = first ? Math.log(wantDist) : approach(prev.logDist, Math.log(wantDist), delta, RATE.zoom, cut);
    const t = zoomTAt(Math.exp(logDist), fit);
    const pose = zoomPose(t, fit, v.pitchDeg);
    const pitch = first ? pose.pitchDeg : approach(prev.pitch, pose.pitchDeg, delta, RATE.pitch, cut);
    const yaw = first || cut ? v.yawDeg : prev.yaw + shortestYawDelta(prev.yaw, v.yawDeg) * followAlpha(delta, RATE.yaw);
    const playerPivot: V3 = [followTarget.x, ground(followTarget.x, followTarget.z) + THIRD_PERSON_VIEW.targetHeight, followTarget.z];
    const wantPivot = bounds ? lerp3(playerPivot, boundsCenter(bounds, 0), pose.pivotBlend) : playerPivot;
    const pivot = first || cut ? wantPivot : lerp3(prev.pivot, wantPivot, followAlpha(delta, RATE.pivot));
    const near = t < PULL_IN_MAX_T;
    const shot = solveThirdPerson({
      target: pivot, yawDeg: yaw, pitchDeg: pitch, lookPitchDeg: pitch * (pose.lookPitchDeg / Math.max(1e-6, pose.pitchDeg)),
      distance: pose.distance, obstacles: near ? obstacles : [], heightAt: near ? heightAt : null,
    });
    if (heightAt) shot.position[1] = Math.max(shot.position[1], heightAt(shot.position[0], shot.position[2]) + 0.6);

    // ---------- plano de a dos (charla) ----------
    let wantPos: V3 = shot.position;
    let wantLook: V3 = shot.lookAt;
    let wantFov = thirdPersonFov(aspect);
    if (twoShot) {
      const o = cameraOffset(twoShot.pitchDeg, twoShot.yawDeg, twoShot.distance);
      wantPos = [twoShot.target[0] + o[0], twoShot.target[1] + o[1], twoShot.target[2] + o[2]];
      if (heightAt) wantPos[1] = Math.max(wantPos[1], heightAt(wantPos[0], wantPos[2]) + 0.6);
      wantLook = [...twoShot.target] as V3;
      wantFov = perspectiveFov(aspect);
    }
    const dialogue = twoShot !== null;
    const switched = prev !== null && prev.wasDialogue !== dialogue;
    let blending = (prev?.blending ?? false) || switched;
    let pos = wantPos;
    let look = wantLook;
    let fov = wantFov;
    if (prev && blending && !cut) {
      const a = followAlpha(delta, TWO_SHOT.rate);
      pos = lerp3(prev.pos, wantPos, a);
      look = lerp3(prev.look, wantLook, a);
      fov = prev.fov + (wantFov - prev.fov) * a;
      if (dist3(pos, wantPos) < 0.05 && dist3(look, wantLook) < 0.05 && Math.abs(fov - wantFov) < 0.05) blending = false;
    } else blending = false;

    st.current = {
      logDist, pitch, yaw, pivot, pos, look, fov, blending, wasDialogue: dialogue, fitKey, fit,
      reportedFit: Math.abs(fit - reportedFit) > reportedFit * FIT_REPORT_DELTA ? fit : reportedFit,
    };

    c.position.set(pos[0], pos[1], pos[2]);
    c.lookAt(look[0], look[1], look[2]);
    const viewDist = dialogue ? TWO_SHOT.distance : shot.distanceUsed;
    cameraLook.x = dialogue ? look[0] : pivot[0];
    cameraLook.y = dialogue ? look[1] : pivot[1];
    cameraLook.z = dialogue ? look[2] : pivot[2];
    cameraLook.distance = viewDist;
    cameraLook.t = t;
    cameraLook.yawDeg = yaw;
    cameraLook.camera = c;
    const dclip = dialogue ? cameraClip(TWO_SHOT.distance, TWO_SHOT.pitchDeg, fov, aspect) : null;
    const nearPlane = dclip ? Math.min(dclip.near, pose.near) : pose.near;
    const farPlane = Math.max(pose.far, dclip?.far ?? 0);
    if (nearPlane !== clip.current.near || farPlane !== clip.current.far || fov !== clip.current.fov) {
      clip.current = { near: nearPlane, far: farPlane, fov };
      c.near = nearPlane;
      c.far = farPlane;
      c.fov = fov;
      c.updateProjectionMatrix();
    }
  });

  // near/far/fov no van como props: los fija el cuadro (si fueran props, cada render los pisaría).
  return <PerspectiveCamera ref={cam} makeDefault />;
}
