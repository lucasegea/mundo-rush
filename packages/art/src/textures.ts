// @lg/art textures.ts: el inventario de texturas del mundo abierto (open-world-3d T6 paso 0, D-832, AC74) y la cuenta
// de sus bytes, en dato puro y sin three. Una sola lista: la leen el script `assets:texture-table` (la tabla por tier que
// decide formato y tamaño ANTES de codificar), `estimateTextureMemory` de world/budget (memoria de GPU contra los topes
// 24 / 48 / 96 MB de TIER_BUDGETS) y los módulos de world/ que crean cada textura (sus medidas salen de acá). Los .ktx2
// se cuentan por su cabecera (`parseKtx2Header`): ancho, alto, niveles y modelo de color (ETC1S o UASTC) dan los bytes
// del formato al que transcodifica el escritorio: BC7 para las dos variantes (D-832; ver `BASIS_TARGET`).
import { OPEN_WORLD_DENSITY, WORLD_TIERS, type WorldTier } from "./density.ts";

/** Formatos candidatos (D-832): las dos variantes de Basis y lo que se crea en tiempo de ejecución. */
export const TEXTURE_FORMATS = ["etc1s", "uastc", "rgba8", "rg16f", "r8", "depth32"] as const;
export type TextureFormat = (typeof TEXTURE_FORMATS)[number];

/** Una textura que crea el mundo (por archivo .ktx2, lienzo, render target o DataTexture). */
export interface WorldTexture {
  id: string;
  /** Para la tabla: suelo, rocas, árboles, impostores, pasto, cielo, etiquetas, sombra. */
  group: string;
  width: number;
  height: number;
  mips: boolean;
  alpha: boolean;
  /** Formato elegido (para un .ktx2, después de la tabla del paso 0) y los candidatos que la tabla compara. */
  format: TextureFormat;
  candidates: readonly TextureFormat[];
  /** Cuántas hay en cada tier (0 = no se crea). */
  count: Readonly<Record<WorldTier, number>>;
  /** Ruta servida de un .ktx2 (desde la raíz del repo). */
  file?: string;
  /** La tarea que la crea (T6 suelo y cielo, T7 árboles y rocas, T8 pasto): la tabla muestra también las por venir. */
  task: "T6" | "T7" | "T8" | "m7";
  /** Mapa normal (se codifica lineal y comprime peor: la estimación de bytes de archivo lo tiene en cuenta). */
  normal?: boolean;
  /** Lado en el mockup V6, si el elegido es otro (PD-4 paso 1: normales de 1024 a 512). */
  v6Px?: number;
}

const all = (n: number): Record<WorldTier, number> => ({ low: n, medium: n, high: n });
const tiers = (low: number, medium: number, high: number): Record<WorldTier, number> => ({ low, medium, high });

/** Mapas fotográficos del suelo (Poly Haven, CC0): difuso en todo tier, normal donde DENSITY lo pide (D-832, PD-4). */
export const GROUND_MAPS = ["leafy_grass", "sparse_grass", "forest_ground_04", "rock_face_03", "rocky_terrain"] as const;
export type GroundMap = (typeof GROUND_MAPS)[number];
/**
 * Lado de los mapas del suelo (px). Elegido con la tabla del paso 0 (AC74): el difuso queda en 1024 como en V6; los
 * normales bajan a 512 (PD-4 paso 1) y van en ETC1S (paso 2), porque con UASTC la descarga del muelle no entra en
 * `assets_muelle_mb` (ver `scripts/assets/texture-table.ts`).
 */
export const GROUND_DIFFUSE_PX = 1024;
export const GROUND_NORMAL_PX = 512;
export const GROUND_NORMAL_V6_PX = 1024;
export const TEXTURES_DIR = "apps/web/public/textures";
export const groundTextureFile = (map: GroundMap, kind: "diff" | "nor"): string => `${TEXTURES_DIR}/${map.replace(/_/g, "-")}-${kind}.ktx2`;

/** Medidas de lo que se dibuja en tiempo de ejecución (los módulos de world/ las leen de acá). */
export const RUNTIME_TEXTURE_PX = {
  /** El atlas de matas del pasto V6 (cuatro variantes de 256 px, T8). */
  grassAtlas: [1024, 256],
  /** El atlas de flores (cuatro celdas de 64 px, T7). */
  flowerAtlas: [256, 64],
  /** El atlas de nubes: 3 cúmulos y 2 velos de 512 × 256 (T6). */
  cloudAtlas: [512, 1280],
  /** Un impostor por especie: vista de costado y copa desde arriba (T7, mockup `world.js:1319`). */
  impostor: [512, 256],
  /** Altura y tierra del pasto: RG16F de 1 m por texel sobre el área del pasto (T8, PD-2). */
  grassHeight: [240, 200],
} as const;

/** Especies con impostor (pinos y latifoliadas; los arbustos no tienen, T7). */
export const IMPOSTOR_SPECIES = 5;

/** El inventario completo del mundo abierto (el de m7, como la pincelada y las etiquetas, lo suma world/budget aparte). */
export const OPEN_WORLD_TEXTURES: readonly WorldTexture[] = [
  ...GROUND_MAPS.map((m): WorldTexture => ({
    id: `suelo/${m}-diff`, group: "suelo", width: GROUND_DIFFUSE_PX, height: GROUND_DIFFUSE_PX, mips: true, alpha: false,
    format: "etc1s", candidates: ["etc1s", "uastc", "rgba8"], count: all(1), file: groundTextureFile(m, "diff"), task: "T6",
  })),
  ...GROUND_MAPS.map((m): WorldTexture => ({
    id: `suelo/${m}-nor`, group: "suelo", width: GROUND_NORMAL_PX, height: GROUND_NORMAL_PX, mips: true, alpha: false,
    format: "etc1s", candidates: ["uastc", "etc1s", "rgba8"],
    count: tiers(...WORLD_TIERS.map((t) => (OPEN_WORLD_DENSITY[t].groundNormals ? 1 : 0)) as [number, number, number]),
    file: groundTextureFile(m, "nor"), task: "T6", normal: true, v6Px: GROUND_NORMAL_V6_PX,
  })),
  // T7 (por venir): 4 juegos de roca (difuso en todo tier, normal en medium y high), hoja y corteza (PD-9).
  { id: "rocas/difuso", group: "rocas", width: 512, height: 512, mips: true, alpha: false, format: "etc1s", candidates: ["etc1s", "uastc"], count: all(4), task: "T7" },
  { id: "rocas/normal", group: "rocas", width: 512, height: 512, mips: true, alpha: false, format: "etc1s", candidates: ["uastc", "etc1s"], count: tiers(0, 4, 4), task: "T7", normal: true },
  { id: "arboles/hoja", group: "árboles", width: 512, height: 512, mips: true, alpha: true, format: "etc1s", candidates: ["etc1s", "uastc", "rgba8"], count: all(1), task: "T7" },
  { id: "arboles/corteza", group: "árboles", width: 512, height: 512, mips: true, alpha: false, format: "etc1s", candidates: ["etc1s", "uastc", "rgba8"], count: all(1), task: "T7" },
  {
    id: "impostores", group: "impostores", width: RUNTIME_TEXTURE_PX.impostor[0], height: RUNTIME_TEXTURE_PX.impostor[1], mips: true, alpha: true,
    format: "rgba8", candidates: ["rgba8"], count: all(IMPOSTOR_SPECIES), task: "T7",
  },
  {
    id: "flores", group: "detalle", width: RUNTIME_TEXTURE_PX.flowerAtlas[0], height: RUNTIME_TEXTURE_PX.flowerAtlas[1], mips: true, alpha: true,
    format: "rgba8", candidates: ["rgba8"], count: all(1), task: "T7",
  },
  {
    id: "pasto/atlas", group: "pasto", width: RUNTIME_TEXTURE_PX.grassAtlas[0], height: RUNTIME_TEXTURE_PX.grassAtlas[1], mips: true, alpha: true,
    format: "rgba8", candidates: ["rgba8"], count: all(1), task: "T8",
  },
  {
    id: "pasto/altura", group: "pasto", width: RUNTIME_TEXTURE_PX.grassHeight[0], height: RUNTIME_TEXTURE_PX.grassHeight[1], mips: false, alpha: false,
    format: "rg16f", candidates: ["rg16f"], count: all(1), task: "T8",
  },
  {
    id: "cielo/nubes", group: "cielo", width: RUNTIME_TEXTURE_PX.cloudAtlas[0], height: RUNTIME_TEXTURE_PX.cloudAtlas[1], mips: true, alpha: true,
    format: "rgba8", candidates: ["rgba8"], count: tiers(...WORLD_TIERS.map((t) => (OPEN_WORLD_DENSITY[t].clouds ? 1 : 0)) as [number, number, number]),
    task: "T6",
  },
];

/** Bytes por bloque de 4 × 4 del formato de escritorio al que transcodifica cada variante de Basis (D-832). */
export const BC_BLOCK_BYTES = { bc1: 8, bc3: 16, bc7: 16 } as const;
export type BcTarget = keyof typeof BC_BLOCK_BYTES;

/**
 * El formato de escritorio de toda textura Basis: BC7 (16 bytes por bloque), para UASTC y también para ETC1S, con o
 * sin alfa. Open-world-3d M3 (QA, AC42/AC74): `KTX2Loader` de three ordena los destinos de ETC1S por `priorityETC1S`
 * (ETC2 1, ETC1 2, BPTC 3, DXT 4); el escritorio con ANGLE/D3D11 tiene BPTC y no ETC, así que ETC1S sale en BC7, no en
 * BC1. La sonda lo midió (low a DPR 1,5: 7,2 MB, lo de BC7; con BC1 serían 3,9). BC7 es además el peor caso de todos
 * los destinos (ETC2 RGB 8, BC1 8, BC3 y ETC2 RGBA 16, ASTC 4x4 16), así que el tope por tier vale en cualquier GPU.
 */
export const BASIS_TARGET: BcTarget = "bc7";

/** Niveles de la cadena completa de mipmaps. */
export const mipLevels = (w: number, h: number): number => Math.floor(Math.log2(Math.max(w, h))) + 1;

/** Bytes de GPU de una textura comprimida por bloques: la suma de los niveles, cada uno redondeado a bloques de 4 × 4. */
export function blockBytes(w: number, h: number, levels: number, target: BcTarget): number {
  let n = 0;
  for (let l = 0; l < levels; l++) n += Math.ceil(Math.max(1, w >> l) / 4) * Math.ceil(Math.max(1, h >> l) / 4) * BC_BLOCK_BYTES[target];
  return n;
}

const BYTES_PER_PX: Record<Exclude<TextureFormat, "etc1s" | "uastc">, number> = { rgba8: 4, rg16f: 4, r8: 1, depth32: 4 };

/** Bytes de GPU de una textura del inventario en su formato (sin contar cuántas hay). */
export function gpuBytes(t: Pick<WorldTexture, "width" | "height" | "mips" | "alpha">, format: TextureFormat): number {
  const levels = t.mips ? mipLevels(t.width, t.height) : 1;
  if (format === "etc1s" || format === "uastc") return blockBytes(t.width, t.height, levels, BASIS_TARGET);
  let n = 0;
  for (let l = 0; l < levels; l++) n += Math.max(1, t.width >> l) * Math.max(1, t.height >> l) * BYTES_PER_PX[format];
  return n;
}

/**
 * Bytes de archivo estimados ANTES de codificar (la tabla del paso 0), por píxel con mipmaps, medidos con basisu 2.50
 * sobre los mapas de 1024 de Poly Haven (`leafy_grass`): ETC1S -q 128 0,14 en el difuso (196 KB) y 0,19 en el normal
 * (263 KB); UASTC nivel 2 sin supercompresión 1,0 (1.392 KB). Los lienzos y render targets no se bajan (0).
 */
export function estimatedFileBytes(t: Pick<WorldTexture, "width" | "height" | "mips" | "normal">, format: TextureFormat): number {
  const px = t.width * t.height * (t.mips ? 4 / 3 : 1);
  if (format === "etc1s") return Math.round(px * (t.normal ? 0.19 : 0.14));
  if (format === "uastc") return Math.round(px);
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// KTX2 (Khronos KTX 2.0): la cabecera fija de 80 bytes, el índice de niveles y el DFD básico. Solo se lee lo que la
// cuenta necesita; un archivo que no es KTX2 lanza un error con el motivo.

const KTX2_ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
/** Modelos de color del DFD de Khronos (KHR_DF_MODEL_ETC1S y KHR_DF_MODEL_UASTC). */
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
  // Muestras del bloque básico: 24 bytes de cabecera y 16 por muestra; canal 15 = alfa (en ETC1S, una segunda muestra).
  const blockSize = v.getUint16(dfd + 4 + 6, true);
  const samples = Math.max(0, Math.floor((blockSize - 24) / 16));
  let alpha = false;
  for (let s = 0; s < samples; s++) if (((bytes[dfd + 4 + 24 + s * 16 + 3] ?? 0) & 0x0f) === 15) alpha = true;
  return { width, height, levels, supercompression, format, alpha };
}

/** Bytes de GPU de un .ktx2 según su cabecera (lo que cuenta `estimateTextureMemory`, D-832). */
export const ktx2GpuBytes = (h: Ktx2Header): number => blockBytes(h.width, h.height, h.levels, BASIS_TARGET);

/**
 * Lo que m7 ya crea en cada tier (world/budget/textures.ts lo cuenta con las medidas reales de cada módulo; un test de
 * apps/web compara estos números con ellos): la pincelada de 256 px con mipmaps, la rampa toon de 4 px, la sombra blob
 * de 64 px, las dos balizas de 64 px, una burbuja de 96 × 72 por NPC, dos etiquetas por NPC (normal y resaltada; la
 * tabla usa un chip típico de 300 × 58 px, el estimador usa `labelLayout`) y el mapa de sombra de 1024 en `high`.
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
