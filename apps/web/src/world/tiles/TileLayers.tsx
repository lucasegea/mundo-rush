// Capas de tiles del diorama: una malla fusionada por chunk de 16×16 y por capa (1 draw call cada una, 03 §2.9).
// Cada capa queda un poco más arriba que la anterior (suelo, detalle, …) para que no peleen en profundidad.
import { useEffect, useMemo } from "react";
import type { TileLayerData } from "@lg/core";
import { pixelTexture } from "../art/texture";
import { drawTestAtlas, TEST_ATLAS } from "./atlas";
import { buildTileChunk, chunkCount } from "./buildTileChunk";

const LAYER_STEP_Y = 0.01;

export function TileLayers({ layers }: { layers: readonly TileLayerData[] }) {
  const { texture, chunks } = useMemo(() => {
    const out: { key: string; layer: number; geometry: ReturnType<typeof buildTileChunk> }[] = [];
    layers.forEach((layer, li) => {
      const { x, z } = chunkCount(layer);
      for (let cz = 0; cz < z; cz++) {
        for (let cx = 0; cx < x; cx++) {
          const geometry = buildTileChunk(layer, cx, cz, TEST_ATLAS, li * LAYER_STEP_Y);
          if (geometry.index && geometry.index.count > 0) out.push({ key: `${layer.name}-${cx}-${cz}`, layer: li, geometry });
          else geometry.dispose();
        }
      }
    });
    return { texture: pixelTexture(drawTestAtlas()), chunks: out };
  }, [layers]);

  useEffect(() => () => {
    texture.dispose();
    chunks.forEach((c) => c.geometry.dispose());
  }, [texture, chunks]);

  return (
    <group>
      {chunks.map((c) => (
        <mesh key={c.key} geometry={c.geometry}>
          {/* La capa de abajo es opaca; las de arriba recortan por alfa (detalles con fondo transparente). */}
          <meshLambertMaterial map={texture} alphaTest={c.layer === 0 ? 0 : 0.5} />
        </mesh>
      ))}
    </group>
  );
}
