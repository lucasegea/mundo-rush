// Luz del diorama en el look C (propuesta C §5, plan estetica-c M1 ítem 12): hemisférica cielo/suelo + sol cálido a
// 48° de elevación y -30° de azimut que sigue al objetivo de la cámara. Sombras según el tier (03 §2.7.1): solo `high`
// proyecta (mapa de 1024 en una caja de 44 × 44 m, solo los personajes la proyectan; terreno y props la reciben); en
// todos los tiers hay sombras blob (actors/BlobShadows). La niebla, el fondo y el tono los fija GameCanvas.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { DirectionalLight } from "three";
import { cameraLook } from "../runtime";
import { HEMI, SUN, SUN_SHADOW, sunDirection } from "./params";

export type ShadowMode = "none" | "blob" | "directional";

const DIR = sunDirection();

export function Lighting({ shadows }: { shadows: ShadowMode }) {
  const sun = useRef<DirectionalLight>(null);
  useFrame(() => {
    const l = sun.current;
    if (!l) return;
    l.position.set(cameraLook.x + DIR[0] * SUN_SHADOW.distance, cameraLook.y + DIR[1] * SUN_SHADOW.distance, cameraLook.z + DIR[2] * SUN_SHADOW.distance);
    l.target.position.set(cameraLook.x, cameraLook.y, cameraLook.z);
    l.target.updateMatrixWorld();
  });
  const cast = shadows === "directional";
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
