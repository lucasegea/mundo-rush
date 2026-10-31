// world/materials/blob.ts — blob shadow texture (greenish radial gradient, like the mockup), built in code and without canvas.
import { DataTexture, LinearFilter, RGBAFormat } from "three";

export const BLOB_SIZE = 64;

/** Alpha per pixel: 0.45 at the center, 0 at the edge, with a smooth falloff. */
export function blobAlpha(size = BLOB_SIZE): Uint8Array {
  const out = new Uint8Array(size * size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - c, y - c) / (size / 2 - 1));
      const t = 1 - d;
      out[y * size + x] = Math.round(255 * 0.45 * t * t * (3 - 2 * t));
    }
  }
  return out;
}

export function blobTexture(): DataTexture {
  const a = blobAlpha();
  const rgba = new Uint8Array(a.length * 4);
  a.forEach((v, i) => rgba.set([40, 50, 30, v], i * 4));
  const t = new DataTexture(rgba, BLOB_SIZE, BLOB_SIZE, RGBAFormat);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}
