// Imágenes pixel art generadas por código (placeholders, D-137: el arte es descartable; F3 trae el pack).
// RGBA en memoria, sin canvas ni DOM: se testean como funciones puras y se suben como DataTexture.
// Convención: y = 0 es la fila de ARRIBA de la imagen; `data` se guarda de abajo hacia arriba (como la espera
// una DataTexture sin flipY), así la fila 0 de un atlas queda arriba en las UV (v cerca de 1).

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export type Rgba = readonly [number, number, number, number];

export function createImage(width: number, height: number): PixelImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** "#rrggbb" → RGBA opaco. */
export function hex(color: string, alpha = 255): Rgba {
  const n = Number.parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

export function setPixel(img: PixelImage, x: number, y: number, c: Rgba): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set(c, ((img.height - 1 - y) * img.width + x) * 4);
}

export function getPixel(img: PixelImage, x: number, y: number): Rgba {
  const i = ((img.height - 1 - y) * img.width + x) * 4;
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0, img.data[i + 3] ?? 0];
}

export function fillRect(img: PixelImage, x: number, y: number, w: number, h: number, c: Rgba): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setPixel(img, i, j, c);
}

/** Ruido determinístico en [0, 1) por coordenada (sin Math.random: el placeholder es siempre igual). */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
