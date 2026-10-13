// Luz del diorama en el look C (propuesta C §5, plan estetica-c M1 ítem 12): hemisférica cielo/suelo + sol cálido a
// 48° de elevación y -30° de azimut que sigue al objetivo de la cámara. Sombras según el tier (03 §2.7.1): solo `high`
// proyecta (mapa de 1024 en una caja de 44 × 44 m, solo los personajes la proyectan; terreno y props la reciben); en
// todos los tiers hay sombras blob (actors/BlobShadows). El fondo y el tono los fija GameCanvas. Desde D-208 la caja de
// sombra y la niebla (la de la escena y la propia del agua) siguen cada cuadro a la distancia ya suavizada de la cámara.
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { Fog, type DirectionalLight } from "three";
import { viewScale } from "../camera/rig";
import { cameraLook } from "../runtime";
import { setWaterFog, waterMaterial } from "../water/waterMaterial";
import { fogFor, HEMI, SUN, SUN_SHADOW, sunDirection, sunShadowFor } from "./params";

export type ShadowMode = "none" | "blob" | "directional";

const DIR = sunDirection();

export function Lighting({ shadows }: { shadows: ShadowMode }) {
  const sun = useRef<DirectionalLight>(null);
  const lastScale = useRef(0);
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
    if (k === lastScale.current) return;
    lastScale.current = k;
    const sc = l.shadow.camera;
    sc.left = -box.half;
    sc.right = box.half;
    sc.top = box.half;
    sc.bottom = -box.half;
    sc.near = box.near;
    sc.far = box.far;
    sc.updateProjectionMatrix();
    const fog = fogFor(k);
    if (scene.fog instanceof Fog) {
      scene.fog.near = fog.near;
      scene.fog.far = fog.far;
    }
    setWaterFog(waterMaterial(), fog.near, fog.far);
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
