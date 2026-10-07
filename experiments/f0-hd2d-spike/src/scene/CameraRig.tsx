import { OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { Vector3, type OrthographicCamera as OrthoCam } from "three";
import {
  cameraOffset,
  followAlpha,
  integerScaleViewWidth,
  orthoFrustum,
  presetAngles,
  snapToPixelGrid,
  TARGET_TILES_WIDE,
  type CameraPreset,
} from "../lib/camera";
import { runtime } from "./runtime";

interface Props {
  preset: CameraPreset;
  pitch: number;
  pixelSnap: boolean;
  integerScale: boolean;
}

const smoothed = new Vector3().copy(runtime.followTarget);
const right = new Vector3();
const up = new Vector3();

/** The only camera of the spike (R11): topdownOrtho / isoOrtho presets, smoothed follow, pixel snap. */
export function CameraRig({ preset, pitch, pixelSnap, integerScale }: Props) {
  const cam = useRef<OrthoCam>(null);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const physicalWidth = size.width * dpr;
  const viewWidth = integerScale ? integerScaleViewWidth(physicalWidth) : TARGET_TILES_WIDE;

  useLayoutEffect(() => {
    const c = cam.current;
    if (!c) return;
    Object.assign(c, orthoFrustum(viewWidth, size.width / Math.max(1, size.height)));
    c.updateProjectionMatrix();
    runtime.viewWidthM = viewWidth;
  }, [viewWidth, size.width, size.height]);

  useFrame((_, delta) => {
    const c = cam.current;
    if (!c) return;
    smoothed.lerp(runtime.followTarget, followAlpha(delta));
    const { pitchDeg, yawDeg } = presetAngles(preset, pitch);
    const [ox, oy, oz] = cameraOffset(pitchDeg, yawDeg);
    c.position.set(smoothed.x + ox, smoothed.y + oy, smoothed.z + oz);
    c.lookAt(smoothed);
    if (pixelSnap) {
      right.set(1, 0, 0).applyQuaternion(c.quaternion);
      up.set(0, 1, 0).applyQuaternion(c.quaternion);
      const snapped = snapToPixelGrid(c.position.toArray(), right.toArray(), up.toArray(), viewWidth / physicalWidth);
      c.position.fromArray(snapped);
    }
  });

  return <OrthographicCamera ref={cam} makeDefault manual near={0.1} far={200} zoom={1} />;
}
