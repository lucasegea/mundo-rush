// Luz del diorama en el look C (propuesta C §5, plan estetica-c M1 ítem 12): hemisférica cielo/suelo + sol cálido a
// 48° de elevación y -30° de azimut que sigue al objetivo de la cámara. Sombras según el tier (03 §2.7.1): solo `high`
// proyecta (mapa de 1024 en una caja de 44 × 44 m, solo los personajes la proyectan; terreno y props la reciben); en
// todos los tiers hay sombras blob (actors/BlobShadows). El fondo y el tono los fija GameCanvas. Desde D-208 la caja de
// sombra sigue cada cuadro a la distancia ya suavizada de la cámara; desde open-world-3d T5 la niebla (la de la escena y
// la propia del agua) sigue al t de zoom (PD-5).
// Plan estetica-c M6: `fogScale` acorta la niebla por tier (la "distancia de dibujo" corta de `low`).
// Open-world-3d T7b (D-839): la luz (sol, hemisférica) y el rango de la niebla salen del look del diorama (`look`).
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
  // Open-world-3d M3 (fuga al cambiar de tier): three no libera el mapa de sombra cuando `castShadow` se apaga; al bajar
  // de `high` el mapa de 1024 (y su profundidad) quedaba vivo. Se libera acá y three lo vuelve a crear si se prende.
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
    // Open-world-3d T5 (PD-5): la niebla sigue al t de zoom ya suavizado (con DEFAULT_LOOK, de 45-250 m de cerca a
    // 520-1.500 m con el mapa entero), con la escala del tier: `fogFor` de world/sky (AC40) con el rango del look.
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
