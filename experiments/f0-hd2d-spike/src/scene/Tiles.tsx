import { useEffect, useMemo } from "react";
import { ATLAS, drawTileAtlas, pixelCanvasTexture, textureGpuBytes } from "../lib/art";
import { buildTileChunk, chunkCount, type TileLayer } from "../lib/tileChunk";
import { buildTilemap } from "../lib/world";
import { runtime } from "./runtime";

const DETAIL_Y = 0.01;

function chunksOf(layer: TileLayer, y: number) {
  const { x, z } = chunkCount(layer);
  const out = [];
  for (let cz = 0; cz < z; cz++) {
    for (let cx = 0; cx < x; cx++) {
      const g = buildTileChunk(layer, cx, cz, ATLAS, y);
      if (g.index && g.index.count > 0) out.push({ key: `${cx}-${cz}`, geometry: g });
      else g.dispose();
    }
  }
  return out;
}

/** Ground + details layers, one merged mesh per 16x16 chunk and layer. */
export function Tiles() {
  const { texture, ground, details } = useMemo(() => {
    const atlas = drawTileAtlas();
    runtime.generatedTextures.tileAtlas = textureGpuBytes(atlas);
    const map = buildTilemap();
    return { texture: pixelCanvasTexture(atlas), ground: chunksOf(map.ground, 0), details: chunksOf(map.details, DETAIL_Y) };
  }, []);

  useEffect(
    () => () => {
      texture.dispose();
      [...ground, ...details].forEach((c) => c.geometry.dispose());
    },
    [texture, ground, details],
  );

  return (
    <group>
      {ground.map((c) => (
        <mesh key={`g${c.key}`} geometry={c.geometry} receiveShadow>
          <meshLambertMaterial map={texture} />
        </mesh>
      ))}
      {details.map((c) => (
        <mesh key={`d${c.key}`} geometry={c.geometry} receiveShadow>
          <meshLambertMaterial map={texture} alphaTest={0.5} />
        </mesh>
      ))}
    </group>
  );
}
