// Luz del diorama en el look C (propuesta C §5, plan estetica-c M1 ítem 12): hemisférica cielo/suelo + sol cálido a
// 48° de elevación y -30° de azimut que sigue al objetivo de la cámara. Sombras según el tier (03 §2.7.1): solo `high`
// proyecta (mapa de 1024 en una caja de 44 × 44 m, solo los personajes la proyectan; terreno y props la reciben); en
// todos los tiers hay sombras blob (actors/BlobShadows). El fondo y el tono los fija GameCanvas. Desde D-208 la caja de
// sombra sigue cada cuadro a la distancia ya suavizada de la cámara; desde open-world-3d T5 la niebla (la de la escena y
// la propia del agua) sigue al t de zoom (PD-5).
// Plan estetica-c M6: `fogScale` acorta la niebla por tier (la "distancia de dibujo" corta de `low`).
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { Fog, type DirectionalLight } from "three";
import { viewScale } from "../camera/rig";
import { zoomPose } from "../camera/zoom";
import { cameraLook } from "../runtime";
import { setWaterFog, waterMaterial } from "../water/waterMaterial";
import { HEMI, SUN, SUN_SHADOW, sunDirection, sunShadowFor } from "./params";

export type ShadowMode = "none" | "blob" | "directional";

const DIR = sunDirection();

export function Lighting({ shadows, fogScale = 1 }: { shadows: ShadowMode; fogScale?: number }) {
  const sun = useRef<DirectionalLight>(null);
  const lastScale = useRef(0);
  const lastFog = useRef({ near: 0, far: 0 });
  const scene = useThree((s) => s.scene);
  const cast = shadows === "directional";
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
    // Open-world-3d T5 (PD-5): la niebla sigue al t de zoom ya suavizado (de 45-250 m de cerca a 520-1.500 m con el
    // mapa entero), con la escala del tier en el extremo cercano. T6 SEAM: `fogFor(scale, t)` de AC40 la reemplaza.
    const pose = zoomPose(cameraLook.t, 1, 0, fogScale);
    const near = Math.round(pose.fogNear);
    const far = Math.round(pose.fogFar);
    if (near === lastFog.current.near && far === lastFog.current.far) return;
    lastFog.current = { near, far };
    if (scene.fog instanceof Fog) {
      scene.fog.near = near;
      scene.fog.far = far;
    }
    setWaterFog(waterMaterial(), near, far);
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
