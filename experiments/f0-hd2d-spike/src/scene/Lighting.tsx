import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { DirectionalLight } from "three";
import { runtime } from "./runtime";

const SUN_OFFSET = [-12, 22, 10] as const;
const SHADOW_HALF = 20;

/** 1 directional (shadow map 1024 when enabled, following the camera target) + ambient. */
export function Lighting({ shadows }: { shadows: boolean }) {
  const sun = useRef<DirectionalLight>(null);

  useFrame(() => {
    const l = sun.current;
    if (!l) return;
    const t = runtime.followTarget;
    l.position.set(t.x + SUN_OFFSET[0], SUN_OFFSET[1], t.z + SUN_OFFSET[2]);
    l.target.position.copy(t);
    l.target.updateMatrixWorld();
  });

  return (
    <>
      <ambientLight intensity={1.1} color="#dfe8ff" />
      <directionalLight
        ref={sun}
        intensity={2.2}
        color="#fff1d6"
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
    </>
  );
}
