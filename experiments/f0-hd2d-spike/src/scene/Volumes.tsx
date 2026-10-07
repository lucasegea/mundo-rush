import { useEffect, useMemo } from "react";
import { BoxGeometry, ConeGeometry, CylinderGeometry, MeshLambertMaterial, MeshBasicMaterial, type Material } from "three";
import { buildVolumes, type Volume } from "../lib/world";

/** Emissive bits (windows, lamp heads) are unlit and > 1 so the bloom threshold picks them up. */
const GLOW = "#ffd27a";
const GLOW_INTENSITY = 3;

/** ~40 simple volumes (boxes by code; no glTF pack present, D-153). Shared geometries and materials. */
export function Volumes() {
  const { volumes, geo, mat, glow, dispose } = useMemo(() => {
    const geo = {
      box: new BoxGeometry(1, 1, 1),
      roof: new ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4),
      cyl: new CylinderGeometry(0.5, 0.5, 1, 12),
    };
    const cache = new Map<string, Material>();
    const mat = (color: string) => {
      let m = cache.get(color);
      if (!m) cache.set(color, (m = new MeshLambertMaterial({ color })));
      return m;
    };
    const glow = new MeshBasicMaterial({ color: GLOW, toneMapped: false });
    glow.color.multiplyScalar(GLOW_INTENSITY);
    const dispose = () => {
      Object.values(geo).forEach((g) => g.dispose());
      cache.forEach((m) => m.dispose());
      glow.dispose();
    };
    return { volumes: buildVolumes(), geo, mat, glow, dispose };
  }, []);

  useEffect(() => dispose, [dispose]);

  const piece = (v: Volume, i: number) => {
    const base = { castShadow: true, receiveShadow: true };
    switch (v.kind) {
      case "house":
        return (
          <group key={i} position={[v.x, 0, v.z]}>
            <mesh {...base} geometry={geo.box} material={mat(v.color)} position={[0, v.h / 2, 0]} scale={[v.w, v.h, v.d]} />
            <mesh {...base} geometry={geo.roof} material={mat("#9a4a3a")} position={[0, v.h + 0.6, 0]} scale={[v.w + 0.4, 1.2, v.d + 0.4]} />
            <mesh geometry={geo.box} material={glow} position={[-0.9, 1.2, v.d / 2 + 0.01]} scale={[0.6, 0.5, 0.02]} />
            <mesh geometry={geo.box} material={glow} position={[0.9, 1.2, v.d / 2 + 0.01]} scale={[0.6, 0.5, 0.02]} />
          </group>
        );
      case "shed":
        return (
          <group key={i} position={[v.x, 0, v.z]}>
            <mesh {...base} geometry={geo.box} material={mat(v.color)} position={[0, v.h / 2, 0]} scale={[v.w, v.h, v.d]} />
            <mesh {...base} geometry={geo.box} material={mat("#5a5a62")} position={[0, v.h + 0.1, 0]} scale={[v.w + 0.3, 0.2, v.d + 0.3]} />
          </group>
        );
      case "tank":
        return (
          <group key={i} position={[v.x, 0, v.z]}>
            {[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([lx, lz], j) => (
              <mesh key={j} {...base} geometry={geo.box} material={mat("#5a5a62")} position={[lx!, 1, lz!]} scale={[0.15, 2, 0.15]} />
            ))}
            <mesh {...base} geometry={geo.cyl} material={mat(v.color)} position={[0, 2.75, 0]} scale={[v.w, 1.5, v.d]} />
          </group>
        );
      case "lamp":
        return (
          <group key={i} position={[v.x, 0, v.z]}>
            <mesh {...base} geometry={geo.box} material={mat(v.color)} position={[0, v.h / 2, 0]} scale={[v.w, v.h, v.d]} />
            <mesh geometry={geo.box} material={glow} position={[0, v.h + 0.15, 0]} scale={[0.35, 0.3, 0.35]} />
          </group>
        );
      default:
        return (
          <mesh key={i} {...base} geometry={v.kind === "hay" ? geo.cyl : geo.box} material={mat(v.color)} position={[v.x, v.h / 2, v.z]} scale={[v.w, v.h, v.d]} />
        );
    }
  };

  return <group>{volumes.map(piece)}</group>;
}
