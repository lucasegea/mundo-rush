// world/budget/textures.ts — memoria de texturas estimada por tier (plan estetica-c M6, 03 §2.7.1: ≤ 24 / 48 / 96 MB).
// El mundo C casi no usa texturas: la pincelada de 256 px (con mipmaps), la rampa toon de 4 px, la sombra blob de 64 px,
// un chip de nombre por NPC (CanvasTexture dibujada a 2x, con mipmaps) y una burbuja de pedido por NPC (cota de arriba);
// en `high` además el mapa de sombra de 1024 (profundidad de 32 bits). Puro: las medidas salen de los mismos módulos
// que crean las texturas (toon.ts, blob.ts, labels.ts, bubbleSprite.ts, lighting/params.ts). No cuenta los buffers de
// pantalla del postprocesado (dependen de la resolución; los mide renderer.info en la instantánea del modo director).
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
  };
  const bytes = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  return { bytes, mb: bytes / MB, parts };
}
