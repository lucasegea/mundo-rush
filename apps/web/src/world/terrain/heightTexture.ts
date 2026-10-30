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
  /** Ancho y alto en texels (el `uHmBox` del pasto es origen y tamaño en metros). */
  width: number;
  height: number;
}

const texel = (map: HeightDirtMap, i: number, j: number, c: 0 | 1): number => {
  const ii = Math.min(map.width - 1, Math.max(0, i));
  const jj = Math.min(map.height - 1, Math.max(0, j));
  return DataUtils.fromHalfFloat((map.texture.image.data as Uint16Array)[(jj * map.width + ii) * 2 + c] as number);
};

/**
 * Open-world-3d T8: altura y tierra en (x, z) leídas de la MISMA textura como la lee la GPU (filtro lineal entre los
 * centros de texel, borde a borde): el recorte del pasto en la CPU decide con lo que el sombreador va a dibujar.
 */
export function sampleHeightDirt(map: HeightDirtMap, x: number, z: number): { height: number; dirt: number } {
  const u = (x - map.originX) / map.metersPerTexel - 0.5;
  const v = (z - map.originZ) / map.metersPerTexel - 0.5;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const at = (c: 0 | 1): number =>
    (texel(map, i, j, c) * (1 - fu) + texel(map, i + 1, j, c) * fu) * (1 - fv) + (texel(map, i, j + 1, c) * (1 - fu) + texel(map, i + 1, j + 1, c) * fu) * fv;
  return { height: at(0), dirt: at(1) };
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
  return { texture, originX, originZ, metersPerTexel: 1, width: w, height: h };
}
