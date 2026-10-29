// world/budget/textures.ts — memoria de texturas estimada por tier (plan estetica-c M6, 03 §2.7.1: ≤ 24 / 48 / 96 MB).
// El mundo C casi no usa texturas: la pincelada de 256 px (con mipmaps), la rampa toon de 4 px, la sombra blob de 64 px,
// un chip de nombre por NPC (CanvasTexture dibujada a 2x, con mipmaps) y una burbuja de pedido por NPC (cota de arriba);
// en `high` además el mapa de sombra de 1024 (profundidad de 32 bits). Puro: las medidas salen de los mismos módulos
// que crean las texturas (toon.ts, blob.ts, labels.ts, bubbleSprite.ts, lighting/params.ts). No cuenta los buffers de
// pantalla del postprocesado (dependen de la resolución; los mide renderer.info en la instantánea del modo director).
// Open-world-3d T6 (D-832, AC42): con `openWorld` suma además cada textura que crea el mundo abierto en ese tier (el
// inventario OPEN_WORLD_TEXTURES de @lg/art: suelo, rocas, hoja, corteza, impostores, pasto, flores, nubes, la textura
// de altura del pasto). Un .ktx2 cuya cabecera se pasa en `headers` cuenta con su ancho, alto, formato y niveles reales
// (bytes de bloque del destino BC); el resto con su medida declarada.
// Open-world-3d T7b (D-841): el inventario es el del look del diorama (`worldTextures(look)`, antes OPEN_WORLD_TEXTURES).
import { gpuBytes, ktx2GpuBytes, worldTextures, type Ktx2Header, type WorldLook, type WorldTier } from "@lg/art";
import { BLOB_SIZE } from "../materials/blob";
import { BRUSH_SIZE, TOON_BANDS } from "../materials/toon";
import { BUBBLE_LAYOUT } from "../labels/bubbleSprite";
import { SUN_SHADOW } from "../lighting/params";

const RGBA = 4;
/** La cadena de mipmaps suma un tercio. */
const MIPS = 4 / 3;
const MB = 1024 * 1024;

export interface TextureBudgetInput {
  /** Medidas (px) del chip de nombre de cada NPC (labelLayout). */
  labels: readonly { width: number; height: number }[];
  /** Burbujas de pedido (una por NPC como cota de arriba). */
  bubbles: number;
  /** ¿Hay mapa de sombra direccional (solo `high`)? */
  shadowMap: boolean;
  /** El mundo abierto de un tier con un look; `headers` son las cabeceras KTX2 leídas de los archivos servidos (por ruta). */
  openWorld?: { tier: WorldTier; look: WorldLook; headers?: Readonly<Record<string, Ktx2Header>> };
}

/** Bytes en GPU de las texturas del mundo abierto en un tier con un look, por id del inventario. */
export function openWorldTextureParts(tier: WorldTier, look: WorldLook, headers: Readonly<Record<string, Ktx2Header>> = {}): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const t of worldTextures(look)) {
    const n = t.count[tier];
    if (n === 0) continue;
    const header = t.file ? headers[t.file] : undefined;
    parts[t.id] = n * (header ? ktx2GpuBytes(header) : gpuBytes(t, t.format));
  }
  return parts;
}

export interface TextureEstimate {
  bytes: number;
  mb: number;
  /** Por textura, para el mensaje de un test que falle. */
  parts: Record<string, number>;
}

export function estimateTextureMemory(input: TextureBudgetInput): TextureEstimate {
  const parts: Record<string, number> = {
    pincelada: BRUSH_SIZE * BRUSH_SIZE * RGBA * MIPS,
    rampa: TOON_BANDS.length * RGBA,
    "sombra-blob": BLOB_SIZE * BLOB_SIZE * RGBA,
    etiquetas: input.labels.reduce((n, l) => n + l.width * l.height * RGBA * MIPS, 0),
    burbujas: input.bubbles * BUBBLE_LAYOUT.width * BUBBLE_LAYOUT.height * RGBA * MIPS,
    "mapa de sombra": input.shadowMap ? SUN_SHADOW.mapSize * SUN_SHADOW.mapSize * 4 : 0,
    ...(input.openWorld ? openWorldTextureParts(input.openWorld.tier, input.openWorld.look, input.openWorld.headers) : {}),
  };
  const bytes = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  return { bytes, mb: bytes / MB, parts };
}
