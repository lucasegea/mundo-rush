// world/camera/CameraRig.tsx — la ÚNICA cámara del juego (R11; lint: cámaras solo en world/camera/). Desde D-207 (plan
// estetica-c M1) es un lente largo en perspectiva: `perspective3D` (FOV 30°, 40,5° en vertical, inclinación 50°, giro
// 45°, 40 / 30 / 22 m por paso de zoom, mira al jugador a 0,8 m, sigue con suavizado a 5/s) y, durante la charla con un
// NPC del diorama, `dialogueFrame` (plano de a dos en 3/4 con test de oclusión, transición a 3/s). Sin órbita libre.
// Con "reducir movimiento", corte en vez de paneo.
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { PerspectiveCamera as PerspCam } from "three";
import type { CameraPresetId } from "@lg/core";
import type { ConversationFrame } from "../../state/selectors";
import { cameraLook, followTarget } from "../runtime";
import {
  cameraOffset, cutFollow, followAlpha, PERSPECTIVE, perspectiveFov, shortestYawDelta, TWO_SHOT, twoShotFrame,
  zoomDistance, type Obstacle,
} from "./rig";

interface Props {
  preset: CameraPresetId;
  pitchDeg: number;
  yawDeg: number;
  zoomStep: number;
  motion: "follow" | "cut";
  conversation: ConversationFrame | null;
  obstacles: readonly Obstacle[];
  heightAt: ((x: number, z: number) => number) | null;
}

interface Shot {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  dist: number;
}

export function CameraRig({ preset, pitchDeg, yawDeg, zoomStep, motion, conversation, obstacles, heightAt }: Props) {
  const cam = useRef<PerspCam>(null);
  const shot = useRef<Shot | null>(null);
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const fov = perspectiveFov(aspect);
  const twoShot = useMemo(
    () => (preset === "dialogueFrame" && conversation ? twoShotFrame(conversation.player, conversation.npc, obstacles, heightAt ?? undefined) : null),
    [preset, conversation, obstacles, heightAt],
  );

  useFrame((_, delta) => {
    const c = cam.current;
    if (!c) return;
    const want: Shot = twoShot
      ? { x: twoShot.target[0], y: twoShot.target[1], z: twoShot.target[2], pitch: twoShot.pitchDeg, yaw: twoShot.yawDeg, dist: twoShot.distance }
      : { x: followTarget.x, y: PERSPECTIVE.targetHeight, z: followTarget.z, pitch: pitchDeg, yaw: yawDeg, dist: zoomDistance(zoomStep) };
    const cur = shot.current;
    if (!cur || !followTarget.ready) shot.current = want;
    else if (motion === "cut") {
      // Corte: ángulos y distancia saltan; en el mapa el objetivo se queda quieto hasta que el jugador sale del centro.
      const halfW = want.dist * Math.tan(((fov * Math.PI) / 180) / 2) * aspect;
      const halfD = (want.dist * Math.tan(((fov * Math.PI) / 180) / 2)) / Math.sin((want.pitch * Math.PI) / 180);
      const look = twoShot ? { x: want.x, z: want.z } : cutFollow({ x: cur.x, z: cur.z }, { x: want.x, z: want.z }, halfW, halfD);
      shot.current = { ...want, x: look.x, z: look.z };
    } else {
      const a = followAlpha(delta, twoShot ? TWO_SHOT.rate : PERSPECTIVE.followRate);
      shot.current = {
        x: cur.x + (want.x - cur.x) * a,
        y: cur.y + (want.y - cur.y) * a,
        z: cur.z + (want.z - cur.z) * a,
        pitch: cur.pitch + (want.pitch - cur.pitch) * a,
        yaw: cur.yaw + shortestYawDelta(cur.yaw, want.yaw) * a,
        dist: cur.dist + (want.dist - cur.dist) * a,
      };
    }
    const s = shot.current;
    const [ox, oy, oz] = cameraOffset(s.pitch, s.yaw, s.dist);
    c.position.set(s.x + ox, s.y + oy, s.z + oz);
    c.lookAt(s.x, s.y, s.z);
    cameraLook.x = s.x;
    cameraLook.y = s.y;
    cameraLook.z = s.z;
  });

  return <PerspectiveCamera ref={cam} makeDefault fov={fov} near={PERSPECTIVE.near} far={PERSPECTIVE.far} />;
}
