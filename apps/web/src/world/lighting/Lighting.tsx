// Diorama light in look C (proposal C §5, plan estetica-c M1 item 12): sky/ground hemispheric + warm sun at
// 48° elevation and -30° azimuth that follows the camera target. Shadows by tier (03 §2.7.1): only `high`
// casts (1024 map in a 44 × 44 m box, only the characters cast it; terrain and props receive it); on
// all tiers there are blob shadows (actors/BlobShadows). The background and tone are set by GameCanvas. Since D-208 the shadow
// box follows the camera already-smoothed distance each frame; since open-world-3d T5 the fog (the scene and
// the water own) follows the zoom t (PD-5).
// Plan estetica-c M6: `fogScale` shortens the fog per tier (the short "draw distance" of `low`).
// Open-world-3d T7b (D-839): the light (sun, hemispheric) and the fog range come from the diorama look (`look`).
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Fog, type DirectionalLight } from "three";
import type { WorldLook } from "@lg/art";
import { viewScale } from "../camera/rig";
import { cameraLook } from "../runtime";
import { fogFor } from "../sky/palette";
import { setWaterFog, waterMaterial } from "../water/waterMaterial";
import { SUN_SHADOW, sunDirection, sunShadowFor } from "./params";

export type ShadowMode = "none" | "blob" | "directional";

export function Lighting({ shadows, look, fogScale = 1 }: { shadows: ShadowMode; look: WorldLook; fogScale?: number }) {
  const { sun: SUN, hemi: HEMI } = look.light;
  const DIR = useMemo(() => sunDirection(SUN.elevationDeg, SUN.azimuthDeg), [SUN.elevationDeg, SUN.azimuthDeg]);
  const sun = useRef<DirectionalLight>(null);
  const lastScale = useRef(0);
  const lastFog = useRef({ near: 0, far: 0 });
  const scene = useThree((s) => s.scene);
  const cast = shadows === "directional";
  // Open-world-3d M3 (leak on tier change): three does not free the shadow map when `castShadow` is turned off; when dropping
  // from `high` the 1024 map (and its depth) stayed alive. It is freed here and three recreates it if turned on again.
  useEffect(() => {
    const l = sun.current;
    if (cast || !l?.shadow.map) return;
    l.shadow.map.dispose();
    l.shadow.map = null;
  }, [cast]);
  useFrame(() => {
    const l = sun.current;
    if (!l) return;
    const k = viewScale(cameraLook.distance);
    const box = sunShadowFor(k);
    l.position.set(cameraLook.x + DIR[0] * box.distance, cameraLook.y + DIR[1] * box.distance, cameraLook.z + DIR[2] * box.distance);
    l.target.position.set(cameraLook.x, cameraLook.y, cameraLook.z);
    l.target.updateMatrixWorld();
    if (k !== lastScale.current) {
      lastScale.current = k;
      const sc = l.shadow.camera;
      sc.left = -box.half;
      sc.right = box.half;
      sc.top = box.half;
      sc.bottom = -box.half;
      sc.near = box.near;
      sc.far = box.far;
      sc.updateProjectionMatrix();
    }
    // Open-world-3d T5 (PD-5): the fog follows the already-smoothed zoom t (with DEFAULT_LOOK, from 45-250 m up close to
    // 520-1,500 m with the whole map), with the tier scale: `fogFor` of world/sky (AC40) with the look range.
    const fog = fogFor(look.fog.range, fogScale, cameraLook.t);
    const near = Math.round(fog.near);
    const far = Math.round(fog.far);
    if (near === lastFog.current.near && far === lastFog.current.far) return;
    lastFog.current = { near, far };
    if (scene.fog instanceof Fog) {
      scene.fog.near = near;
      scene.fog.far = far;
    }
    setWaterFog(waterMaterial(look), near, far);
  });
  const h = SUN_SHADOW.half;
  return (
    <>
      <hemisphereLight args={[HEMI.sky, HEMI.ground, HEMI.intensity]} />
      <directionalLight
        ref={sun}
        color={SUN.color}
        intensity={SUN.intensity}
        castShadow={cast}
        shadow-mapSize={[SUN_SHADOW.mapSize, SUN_SHADOW.mapSize]}
        shadow-bias={SUN_SHADOW.bias}
        shadow-normalBias={SUN_SHADOW.normalBias}
        shadow-camera-left={-h}
        shadow-camera-right={h}
        shadow-camera-top={h}
        shadow-camera-bottom={-h}
        shadow-camera-near={SUN_SHADOW.near}
        shadow-camera-far={SUN_SHADOW.far}
      />
    </>
  );
}
