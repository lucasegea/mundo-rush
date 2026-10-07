// Volúmenes por código (03 §2.9: "cajas por código" hasta que F3 traiga los glTF del pack). Geometría y material
// compartidos; un color de la paleta por tipo de asset.
import { useEffect, useMemo } from "react";
import { BoxGeometry, MeshLambertMaterial } from "three";
import type { PropBox } from "@lg/core";

const COLORS: Readonly<Record<string, string>> = {
  "codigo/casa": "#c98b5a",
  "codigo/galpon": "#9b4a3c",
  "codigo/caja": "#b48a52",
  "codigo/cerco": "#8a6a44",
};
const DEFAULT_COLOR = "#a0a0a0";

export function Boxes({ boxes }: { boxes: readonly PropBox[] }) {
  const { geometry, materials } = useMemo(() => {
    const kinds = [...new Set(boxes.map((b) => b.asset))];
    return {
      geometry: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), // la base en y = 0
      materials: new Map(kinds.map((k) => [k, new MeshLambertMaterial({ color: COLORS[k] ?? DEFAULT_COLOR })])),
    };
  }, [boxes]);
  useEffect(() => () => {
    geometry.dispose();
    materials.forEach((m) => m.dispose());
  }, [geometry, materials]);

  return (
    <group>
      {boxes.map((b, i) => (
        <mesh key={i} geometry={geometry} material={materials.get(b.asset) as MeshLambertMaterial /* hay uno por cada asset de la lista */} position={[b.x, b.y, b.z]} scale={[b.w, b.h, b.d]} />
      ))}
    </group>
  );
}
