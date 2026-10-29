// world/terrain/heightTexture.ts: la textura de altura y tierra del pasto (open-world-3d T6, PD-2), que world/terrain
// arma y es dueña: RG16F (R altura, G peso de tierra) con filtro lineal de hardware (WebGL2), 1 m por texel sobre los
// límites caminables más 50 m de cada lado (RUNTIME_TEXTURE_PX.grassHeight). El pasto de T8 la recibe y nunca arma
// otra. Los valores salen de la malla dibujada (`heightAt`, `dirtAt`), así el pasto apoya donde se ve el suelo.
import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RGFormat } from "three";
import { RUNTIME_TEXTURE_PX } from "@lg/art";
import type { Bounds } from "@lg/core";
import type { Terrain } from "./buildTerrain";

export interface HeightDirtMap {
  texture: DataTexture;
  /** Esquina (x, z) del texel (0, 0) y metros por texel: el pasto pasa de mundo a UV con esto. */
  originX: number;
  originZ: number;
  metersPerTexel: number;
}

export function heightDirtTexture(terrain: Terrain, bounds: Bounds): HeightDirtMap {
  const [w, h] = RUNTIME_TEXTURE_PX.grassHeight;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const originX = cx - w / 2;
  const originZ = cz - h / 2;
  const data = new Uint16Array(w * h * 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = originX + i + 0.5;
      const z = originZ + j + 0.5;
      data[(j * w + i) * 2] = DataUtils.toHalfFloat(terrain.heightAt(x, z));
      data[(j * w + i) * 2 + 1] = DataUtils.toHalfFloat(terrain.dirtAt(x, z));
    }
  }
  const texture = new DataTexture(data, w, h, RGFormat, HalfFloatType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.name = "pasto/altura";
  texture.needsUpdate = true;
  return { texture, originX, originZ, metersPerTexel: 1 };
}
