// @lg/art textures.ts: the open world's texture inventory (open-world-3d T6 step 0, D-832, AC74) and the count
// of their bytes, as pure data and without three. A single list per look (`worldTextures(look)`, worldLook.ts, T7b): read by the `assets:texture-table` script (the per-tier table that
// decides format and size BEFORE encoding), `estimateTextureMemory` in world/budget (GPU memory against the caps
// 24 / 48 / 96 MB of TIER_BUDGETS) and the world/ modules that create each texture (their measurements come from here). The .ktx2 files
// are counted by their header (`parseKtx2Header`): width, height, levels and color model (ETC1S or UASTC) give the bytes
// of the format the desktop transcodes to: BC7 for both variants (D-832; see `BASIS_TARGET`).
import type { WorldTier } from "./density.ts";

/** Candidate formats (D-832): the two Basis variants and what is created at runtime. */
export const TEXTURE_FORMATS = ["etc1s", "uastc", "rgba8", "rg16f", "r8", "depth32"] as const;
export type TextureFormat = (typeof TEXTURE_FORMATS)[number];

/** A texture the world creates (per .ktx2 file, canvas, render target or DataTexture). */
export interface WorldTexture {
  id: string;
  /** For the table: ground, rocks, trees, impostors, grass, sky, labels, shadow. */
  group: string;
  width: number;
  height: number;
  mips: boolean;
  alpha: boolean;
  /** Chosen format (for a .ktx2, after the step 0 table) and the candidates the table compares. */
  format: TextureFormat;
  candidates: readonly TextureFormat[];
  /** How many there are in each tier (0 = not created). */
  count: Readonly<Record<WorldTier, number>>;
  /** Served path of a .ktx2 (from the repo root). */
  file?: string;
  /** The task that creates it (T6 ground and sky, T7 trees and rocks, T8 grass): the table also shows the upcoming ones. */
  task: "T6" | "T7" | "T8" | "m7";
  /** Normal map (encoded linear and compresses worse: the file-byte estimate takes that into account). */
  normal?: boolean;
  /** Side in the V6 mockup, if the chosen one is different (PD-4 step 1: normals from 1024 to 512). */
  v6Px?: number;
}

/** Photographic ground maps (Poly Haven, CC0): diffuse in every tier, normal where DENSITY asks for it (D-832, PD-4). */
export const GROUND_MAPS = ["leafy_grass", "sparse_grass", "forest_ground_04", "rock_face_03", "rocky_terrain"] as const;
export type GroundMap = (typeof GROUND_MAPS)[number];
/**
 * Side of the ground maps (px). Chosen with the step 0 table (AC74): the diffuse stays at 1024 as in V6; the
 * normals drop to 512 (PD-4 step 1) and go in ETC1S (step 2), because with UASTC the dock download does not fit in
 * `assets_muelle_mb` (see `scripts/assets/texture-table.ts`).
 */
export const GROUND_DIFFUSE_PX = 1024;
export const GROUND_NORMAL_PX = 512;
export const GROUND_NORMAL_V6_PX = 1024;
export const TEXTURES_DIR = "apps/web/public/textures";
export const groundTextureFile = (map: GroundMap, kind: "diff" | "nor"): string => `${TEXTURES_DIR}/${map.replace(/_/g, "-")}-${kind}.ktx2`;

/** Measurements of what is drawn at runtime (the world/ modules read them from here). */
export const RUNTIME_TEXTURE_PX = {
  /** The V6 grass tuft atlas (four 256 px variants, T8). */
  grassAtlas: [1024, 256],
  /** The flower atlas (four 64 px cells, T7). */
  flowerAtlas: [256, 64],
  /** The cloud atlas: 3 cumulus and 2 veils of 512 × 256 (T6). */
  cloudAtlas: [512, 1280],
  /** One impostor per species: side view and canopy from above (T7, mockup `world.js:1319`). */
  impostor: [512, 256],
  /** Grass height and soil: RG16F of 1 m per texel over the grass area (T8, PD-2). */
  grassHeight: [240, 200],
} as const;

/** Species with an impostor (pines and broadleaves; shrubs have none, T7). */
export const IMPOSTOR_SPECIES = 5;

// Open-world-3d T7b (D-841): the inventory is a function of the look, `worldTextures(look)` in worldLook.ts (formerly the
// OPEN_WORLD_TEXTURES constant); the measurements, formats and per-tier counts above are still the core's.

/** Bytes per 4 × 4 block of the desktop format that each Basis variant transcodes to (D-832). */
export const BC_BLOCK_BYTES = { bc1: 8, bc3: 16, bc7: 16 } as const;
export type BcTarget = keyof typeof BC_BLOCK_BYTES;

/**
 * The desktop format of every Basis texture: BC7 (16 bytes per block), for UASTC and also for ETC1S, with or
 * without alpha. Open-world-3d M3 (QA, AC42/AC74): three's `KTX2Loader` orders the ETC1S targets by `priorityETC1S`
 * (ETC2 1, ETC1 2, BPTC 3, DXT 4); desktop with ANGLE/D3D11 has BPTC and not ETC, so ETC1S comes out as BC7, not
 * BC1. The probe measured it (low at DPR 1.5: 7.2 MB, the BC7 figure; with BC1 it would be 3.9). BC7 is also the worst case of all
 * targets (ETC2 RGB 8, BC1 8, BC3 and ETC2 RGBA 16, ASTC 4x4 16), so the per-tier cap holds on any GPU.
 */
export const BASIS_TARGET: BcTarget = "bc7";

/** Levels of the complete mipmap chain. */
export const mipLevels = (w: number, h: number): number => Math.floor(Math.log2(Math.max(w, h))) + 1;

/** GPU bytes of a block-compressed texture: the sum of the levels, each rounded up to 4 × 4 blocks. */
export function blockBytes(w: number, h: number, levels: number, target: BcTarget): number {
  let n = 0;
  for (let l = 0; l < levels; l++) n += Math.ceil(Math.max(1, w >> l) / 4) * Math.ceil(Math.max(1, h >> l) / 4) * BC_BLOCK_BYTES[target];
  return n;
}

const BYTES_PER_PX: Record<Exclude<TextureFormat, "etc1s" | "uastc">, number> = { rgba8: 4, rg16f: 4, r8: 1, depth32: 4 };

/** GPU bytes of an inventory texture in its format (not counting how many there are). */
export function gpuBytes(t: Pick<WorldTexture, "width" | "height" | "mips" | "alpha">, format: TextureFormat): number {
  const levels = t.mips ? mipLevels(t.width, t.height) : 1;
  if (format === "etc1s" || format === "uastc") return blockBytes(t.width, t.height, levels, BASIS_TARGET);
  let n = 0;
  for (let l = 0; l < levels; l++) n += Math.max(1, t.width >> l) * Math.max(1, t.height >> l) * BYTES_PER_PX[format];
  return n;
}

/**
 * File bytes estimated BEFORE encoding (the step 0 table), per pixel with mipmaps, measured with basisu 2.50
 * on the 1024 Poly Haven maps (`leafy_grass`): ETC1S -q 128 0.14 on the diffuse (196 KB) and 0.19 on the normal
 * (263 KB); UASTC level 2 without supercompression 1.0 (1,392 KB). Canvases and render targets are not downloaded (0).
 */
export function estimatedFileBytes(t: Pick<WorldTexture, "width" | "height" | "mips" | "normal">, format: TextureFormat): number {
  const px = t.width * t.height * (t.mips ? 4 / 3 : 1);
  if (format === "etc1s") return Math.round(px * (t.normal ? 0.19 : 0.14));
  if (format === "uastc") return Math.round(px);
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// KTX2 (Khronos KTX 2.0): the fixed 80-byte header, the level index and the basic DFD. Only what the
// count needs is read; a file that is not KTX2 throws an error with the reason.

const KTX2_ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
/** Khronos DFD color models (KHR_DF_MODEL_ETC1S and KHR_DF_MODEL_UASTC). */
export const KTX2_COLOR_MODEL = { etc1s: 163, uastc: 166 } as const;

export interface Ktx2Header {
  width: number;
  height: number;
  levels: number;
  /** 0 ninguna, 1 BasisLZ (ETC1S), 2 Zstandard. */
  supercompression: number;
  format: "etc1s" | "uastc";
  alpha: boolean;
}

export function parseKtx2Header(bytes: Uint8Array): Ktx2Header {
  if (bytes.byteLength < 80 || KTX2_ID.some((b, i) => bytes[i] !== b)) throw new Error("no es un archivo KTX2 (identificador)");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number): number => v.getUint32(o, true);
  const width = u32(20);
  const height = u32(24);
  const levels = Math.max(1, u32(40));
  const supercompression = u32(44);
  const dfd = u32(48);
  if (dfd + 28 > bytes.byteLength) throw new Error("KTX2 sin DFD");
  const colorModel = bytes[dfd + 12];
  const format = colorModel === KTX2_COLOR_MODEL.etc1s ? "etc1s" : colorModel === KTX2_COLOR_MODEL.uastc ? "uastc" : null;
  if (!format) throw new Error(`KTX2 con modelo de color ${String(colorModel)} (se esperaba ETC1S 163 o UASTC 166)`);
  // Basic block samples: 24 header bytes and 16 per sample; channel 15 = alpha (in ETC1S, a second sample).
  const blockSize = v.getUint16(dfd + 4 + 6, true);
  const samples = Math.max(0, Math.floor((blockSize - 24) / 16));
  let alpha = false;
  for (let s = 0; s < samples; s++) if (((bytes[dfd + 4 + 24 + s * 16 + 3] ?? 0) & 0x0f) === 15) alpha = true;
  return { width, height, levels, supercompression, format, alpha };
}

/** GPU bytes of a .ktx2 according to its header (what `estimateTextureMemory` counts, D-832). */
export const ktx2GpuBytes = (h: Ktx2Header): number => blockBytes(h.width, h.height, h.levels, BASIS_TARGET);

/**
 * What m7 already creates in each tier (world/budget/textures.ts counts it with each module's real measurements; a test in
 * apps/web compares these numbers with them): the 256 px brushstroke with mipmaps, the 4 px toon ramp, the 64 px blob shadow,
 * the two 64 px beacons, one 96 × 72 bubble per NPC, two labels per NPC (normal and highlighted; the
 * table uses a typical 300 × 58 px chip, the estimator uses `labelLayout`) and the 1024 shadow map at `high`.
 */
export const M7_TEXTURE_PX = {
  brush: 256,
  ramp: 4,
  blob: 64,
  beacon: 64,
  beacons: 2,
  bubble: [96, 72],
  labelTypical: [300, 58],
  shadowMap: 1024,
} as const;
