// world/camera/CameraRig.tsx — la ÚNICA cámara del juego (R11; lint: cámaras solo en world/camera/). Presets
// desde el store (D-053): `topdownOrtho` (default, yaw 0°, pitch 57°, ~15 tiles, sigue con suavizado y snap a la
// grilla de píxel), `isoOrtho` (yaw 45°) y `dialogueFrame` (el paso más cercano); `perspective3D` y
// `xrTabletop` declarados sin implementar. Sin órbita libre. 3 pasos de zoom con escala entera de píxel (D-197).
// Con "reducir movimiento", corte en vez de paneo.
import { OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { Vector3, type OrthographicCamera as OrthoCam } from "three";
import type { CameraPresetId } from "@lg/core";
import { followTarget } from "../runtime";
import { cameraOffset, cutFollow, followAlpha, orthoFrustum, snapToPixelGrid, zoomViewWidth } from "./rig";

interface Props {
  preset: CameraPresetId;
  pitchDeg: number;
  yawDeg: number;
  zoomStep: number;
  motion: "follow" | "cut";
}

const right = new Vector3();
const up = new Vector3();

export function CameraRig({ preset, pitchDeg, yawDeg, zoomStep, motion }: Props) {
  const cam = useRef<OrthoCam>(null);
  const look = useRef({ x: followTarget.x, z: followTarget.z });
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const physicalWidth = size.width * dpr;
  // dialogueFrame encuadra de cerca; los presets declarados caen al default hasta su épica.
  const step = preset === "dialogueFrame" ? 2 : zoomStep;
  const viewWidth = zoomViewWidth(physicalWidth, step);
  const aspect = size.width / Math.max(1, size.height);

  useLayoutEffect(() => {
    const c = cam.current;
    if (!c) return;
    Object.assign(c, orthoFrustum(viewWidth, aspect));
    c.updateProjectionMatrix();
  }, [viewWidth, aspect]);

  useFrame((_, delta) => {
    const c = cam.current;
    if (!c) return;
    const target = { x: followTarget.x, z: followTarget.z };
    // En "corte", la media vista en profundidad sobre el suelo es la media altura de la vista sobre sin(pitch).
    if (!followTarget.ready) look.current = target;
    else if (motion === "cut") look.current = cutFollow(look.current, target, viewWidth / 2, viewWidth / aspect / 2 / Math.sin((pitchDeg * Math.PI) / 180));
    else {
      const a = followAlpha(delta);
      look.current = { x: look.current.x + (target.x - look.current.x) * a, z: look.current.z + (target.z - look.current.z) * a };
    }
    const [ox, oy, oz] = cameraOffset(pitchDeg, yawDeg);
    const { x, z } = look.current;
    c.position.set(x + ox, oy, z + oz);
    c.lookAt(x, 0, z);
    right.set(1, 0, 0).applyQuaternion(c.quaternion);
    up.set(0, 1, 0).applyQuaternion(c.quaternion);
    c.position.fromArray(snapToPixelGrid(c.position.toArray(), right.toArray(), up.toArray(), viewWidth / physicalWidth));
  });

  return <OrthographicCamera ref={cam} makeDefault manual near={0.1} far={200} zoom={1} />;
}
