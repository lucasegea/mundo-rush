// world/budget/textures.ts — estimated texture memory per tier (plan estetica-c M6, 03 §2.7.1: ≤ 24 / 48 / 96 MB).
// World C barely uses textures: the 256 px brushstroke (with mipmaps), the 4 px toon ramp, the 64 px blob shadow,
// a name chip per NPC (CanvasTexture drawn at 2x, with mipmaps) and a request bubble per NPC (upper bound);
// on `high` also the 1024 shadow map (32-bit depth). Pure: the measurements come from the same modules
// that create the textures (toon.ts, blob.ts, labels.ts, bubbleSprite.ts, lighting/params.ts). It does not count the
// postprocessing screen buffers (they depend on resolution; renderer.info measures them in the director-mode snapshot).
// Open-world-3d T6 (D-832, AC42): with `openWorld` it also adds each texture the open world creates at that tier (the
// OPEN_WORLD_TEXTURES inventory from @lg/art: ground, rocks, leaf, bark, impostors, grass, flowers, clouds, the grass
// height texture). A .ktx2 whose header is passed in `headers` counts with its real width, height, format and levels
// (block bytes of the BC target); the rest with their declared size.
// Open-world-3d T7b (D-841): the inventory is that of the diorama look (`worldTextures(look)`, formerly OPEN_WORLD_TEXTURES).
import { gpuBytes, ktx2GpuBytes, worldTextures, type Ktx2Header, type WorldLook, type WorldTier } from "@lg/art";
import { BLOB_SIZE } from "../materials/blob";
import { BRUSH_SIZE, TOON_BANDS } from "../materials/toon";
import { BUBBLE_LAYOUT } from "../labels/bubbleSprite";
import { SUN_SHADOW } from "../lighting/params";

const RGBA = 4;
/** The mipmap chain adds a third. */
const MIPS = 4 / 3;
const MB = 1024 * 1024;

export interface TextureBudgetInput {
  /** Sizes (px) of each NPC's name chip (labelLayout). */
  labels: readonly { width: number; height: number }[];
  /** Request bubbles (one per NPC as an upper bound). */
  bubbles: number;
  /** Is there a directional shadow map (`high` only)? */
  shadowMap: boolean;
  /** The open world of a tier with a look; `headers` are the KTX2 headers read from the served files (by path). */
  openWorld?: { tier: WorldTier; look: WorldLook; headers?: Readonly<Record<string, Ktx2Header>> };
}

/** GPU bytes of the open world's textures at a tier with a look, by inventory id. */
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
  /** Per texture, for the message of a failing test. */
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
