// @lg/art worldLook.ts: el look del mundo (open-world-3d T7b, D-838..D-842, revisión de arquitectura 2026-10-29 "Per-universe world look").
// El motor del mundo (forma y relieve del terreno, sembrado, recorte y LOD, topes por tier, cámara, clases de material y
// código de los sombreadores, colores de la interfaz y de las etiquetas) es uno solo; lo que cambia de un universo a
// otro (un libro de terror tendrá un mundo de terror) es el LOOK: paleta, cielo y niebla, luz, mapas y grado del suelo,
// vegetación, personajes, agua y camino. Un look es dato puro (sin three) y world/ lo recibe como parámetro: nada de
// world/ importa estos valores como constantes globales ni escribe un hex (D-838, test de apps/web).
//
// El catálogo es fijo (`WORLD_LOOKS`). En T7b tiene los dos looks que el juego ya dibuja en 0034931, sin un valor nuevo:
//   · `pradera` (DEFAULT_LOOK): el mundo abierto de la maqueta V6 (Quaternius, cielo, mapas del suelo, bosque)
//   · `pintado`: el look C de m7 de los dioramas planos (KayKit, bruma de fondo y niebla); es DEFAULT_LOOK con esas
//     tres diferencias, que hasta 0034931 se elegían con `relieve` en cada componente (D-840 las saca de ahí).
// T7b SEAM (diferido por el plan): el campo `look` del manifiesto del universo, las carpetas de assets por look, la
// validación por look de sombreros y cuerpos de las fichas y los looks nuevos del catálogo.
// T8 (D-839): el bloque `grass` (colores del atlas y de las hojas, tinte de parches, tinte de la cama, multiplicador de
// matas); world/nature/grass.ts y la cama del suelo lo leen como uniforms y textura. T9 SEAM (D-839): los colores del minimapa (suelo, camino, agua) salen de
// `palette`/`road`/`water` del look; el punto de NPC es núcleo y su contraste >= 3:1 se prueba contra cada look.
import { CAP_COLOR, BODY_IDS, HATS, SCARVES, type BodyId, type Hat, type Scarf, type ShirtToken } from "./looks.ts";
import { PALETTE, SHIRT_TOKENS, type PaletteToken } from "./palette.ts";
import { OPEN_WORLD_DENSITY, WORLD_TIERS, type WorldTier } from "./density.ts";
import {
  GROUND_DIFFUSE_PX, GROUND_NORMAL_PX, GROUND_NORMAL_V6_PX, groundTextureFile, IMPOSTOR_SPECIES, RUNTIME_TEXTURE_PX,
  type GroundMap, type WorldTexture,
} from "./textures.ts";
import {
  NATURE_COLORS, NATURE_TEXTURES, ROCK_SCANS, rockFile, TREE_BARK_COLOR, TREE_LEAF_GAIN, TREE_SPECIES, treeFile, type RockScan, type TreeSpecies,
} from "./vegetation.ts";

export const LOOK_IDS = ["pradera", "pintado"] as const;
export type LookId = (typeof LOOK_IDS)[number];

/** Los esqueletos de personaje que un look puede pedir (world/actors/rigs.ts tiene la especificación de cada uno). */
export const CHARACTER_RIGS = ["kaykit", "quaternius"] as const;
export type CharacterRig = (typeof CHARACTER_RIGS)[number];
/** Los juegos de accesorios por código (world/actors/accessories.ts: una tabla por juego, no un switch). */
export const ACCESSORY_SETS = ["v6"] as const;
export type AccessorySetId = (typeof ACCESSORY_SETS)[number];

/** Las cinco ranuras del splat del suelo (el sombreador es uno; el look elige qué mapa va en cada ranura). */
export const GROUND_SLOTS = ["grass", "sparse", "dirt", "rock", "rockAlt"] as const;
export type GroundSlot = (typeof GROUND_SLOTS)[number];

export type Vec3 = readonly [number, number, number];
/** Niebla de cerca (t = 0) y del mapa entero (t = 1) del zoom continuo, antes de la escala del tier (AC40). */
export interface FogRange {
  near: readonly [number, number];
  far: readonly [number, number];
}
/** Una parada de degradé del atlas de nubes: [posición 0..1, color CSS con alfa]. */
export type CloudStop = readonly [number, string];

/** Un escaneo de roca del look (los de vegetation.ts ROCK_SCANS): malla cerca/lejos y cuántas variantes dibuja. */
export interface RockScanSpec {
  scan: RockScan;
  kind: "small" | "outcrop";
  near: number;
  far: number;
  meshes: number;
}

/** Los colores del detalle hecho por código (la forma de vegetation.ts NATURE_COLORS, sin los literales). */
export interface NatureColorSet {
  fern: { low: number; high: number };
  pebble: { rock: number; warm: number; moss: number };
  flowerStem: readonly number[];
  flowerLeaf: number;
  flowers: readonly { petal: number; centre: number; petals: number; radius: number }[];
  flowerTint: readonly (readonly [number, number, number])[];
}

/** El bloque del pasto de un look (T8): ver `WorldLook.grass`. */
export interface GrassLook {
  /** Atlas de tarjetas (4 variantes de 256 px): pie de cada hoja, dos medios, cuatro puntas, motas de flor y su tallo. */
  atlas: { base: number; mid: readonly [number, number]; tips: readonly [number, number, number, number]; flowers: readonly [number, number, number]; flowerStem: number };
  /** Hojas reales cerca del jugador (sRGB 0..1): pie, medio (dos), punta (dos, según la hoja). */
  blade: { base: Vec3; mid: readonly [Vec3, Vec3]; tip: readonly [Vec3, Vec3] };
  /** Tinte de parches: de `dark` a `warm` según un patrón grande, por `gain`. */
  tint: { dark: Vec3; warm: Vec3; gain: Vec3 };
  /** Multiplicador del color del suelo bajo el disco de pasto (la cama, ground shader `uBedTint`). */
  bed: Vec3;
  /** Multiplicador de las matas del tier (<= 1). */
  density: number;
}

export interface WorldLook {
  id: LookId;
  /** Los hex de la paleta (palette.ts). Los `paleta` de cada diorama re-apuntan nombres DENTRO de esta paleta. */
  palette: Readonly<Record<PaletteToken, string>>;
  /** La cúpula (de arriba abajo) y el atlas de nubes del mundo abierto (world/sky). */
  sky: {
    zenith: string;
    haze: string;
    horizon: string;
    clouds: { cumulus: readonly CloudStop[]; wisp: readonly CloudStop[]; opacity: number };
  };
  /** Color de la niebla y su rango con el zoom (AC38, AC40); `background` es el fondo del canvas. */
  fog: { color: string; range: FogRange };
  background: string;
  /** Luz de la escena (propuesta C §5), el tono de salida y las luces del horneado de los impostores (T7). */
  light: {
    sun: { color: string; intensity: number; elevationDeg: number; azimuthDeg: number };
    hemi: { sky: string; ground: string; intensity: number };
    exposure: number;
    impostor: { sky: number; ground: number; hemiIntensity: number; sun: number; sunIntensity: number };
  };
  /** Suelo del mundo abierto: mapa por ranura, colores por vértice (tokens) y grado del pasto (uniforms, D-842). */
  ground: {
    maps: Readonly<Record<GroundSlot, GroundMap>>;
    vertex: Readonly<Record<"low" | "high" | "alternate" | "forest" | "rock" | "rockWarm", PaletteToken>>;
    grassGrade: { low: Vec3; high: Vec3; sparseGain: number };
  };
  /**
   * Bosque y detalle del mundo abierto. Cada especie nombra su preset de ez-tree (`name`, scripts/assets/tree-presets.ts)
   * y su archivo horneado. `density` multiplica los conteos de cada tier (<= 1: el tope del tier es del núcleo; lo de
   * adentro de los límites siempre queda, porque la grilla del núcleo bloquea esos troncos, AC46).
   */
  vegetation: {
    species: readonly TreeSpecies[];
    leafGain: number;
    barkColor: number;
    rockScans: readonly RockScanSpec[];
    textures: Readonly<Record<keyof typeof NATURE_TEXTURES, string>>;
    colors: NatureColorSet;
    density: Readonly<Record<"pines" | "farPines" | "broads" | "bushes" | "rocks" | "ferns" | "flowers" | "pebbles", number>>;
  };
  /** Personajes: esqueleto, juego de accesorios, gorra del jugador y lo que una ficha puede pedir (cuerpos, ropa). */
  characters: {
    rig: CharacterRig;
    accessories: AccessorySetId;
    capColor: number;
    bodies: readonly BodyId[];
    shirts: readonly ShirtToken[];
    hats: readonly Hat[];
    scarves: readonly Scarf[];
  };
  /**
   * Pasto V6 del mundo abierto (open-world-3d T8, D-839): colores del atlas de matas (dibujado por código), colores de
   * las hojas reales (sRGB 0..1; el sombreador los linealiza), el tinte de parches grandes (oscuro a cálido, con su
   * ganancia), el tinte de la cama de pasto del suelo y un multiplicador de matas <= 1 (el tope del tier es del núcleo).
   * Todo entra como uniforms o como textura (D-842): dos looks comparten los dos programas del pasto.
   */
  grass: GrassLook;
  /** Agua (tokens de la paleta): bandas, brillo y la bruma propia de su sombreador. */
  water: { shallow: PaletteToken; deep: PaletteToken; glint: PaletteToken; fog: PaletteToken };
  /** Camino (tokens): la superficie, el borde ruidoso y la piedra del empedrado. */
  road: { surface: PaletteToken; border: PaletteToken; paving: PaletteToken };
}

/** El mundo abierto de la maqueta V6 tal como queda en 0034931 (cada valor es el de su constante de entonces). */
export const DEFAULT_LOOK: WorldLook = {
  id: "pradera",
  palette: PALETTE,
  sky: {
    zenith: PALETTE["cielo-cenit"],
    haze: PALETTE["cielo-medio"],
    horizon: PALETTE["cielo-horizonte"],
    clouds: {
      cumulus: [[0, "rgba(255,255,255,0.9)"], [0.6, "rgba(250,252,255,0.55)"], [1, "rgba(240,246,252,0)"]],
      wisp: [[0, "rgba(255,255,255,0)"], [0.3, "rgba(255,255,255,0.8)"], [0.7, "rgba(255,255,255,0.7)"], [1, "rgba(255,255,255,0)"]],
      opacity: 0.97,
    },
  },
  // El horizonte de la cúpula ES la niebla y el fondo (AC38).
  fog: { color: PALETTE["cielo-horizonte"], range: { near: [45, 520], far: [250, 1500] } },
  background: PALETTE["cielo-horizonte"],
  light: {
    sun: { color: PALETTE.sol, intensity: 2.3, elevationDeg: 48, azimuthDeg: -30 },
    hemi: { sky: PALETTE["luz-cielo"], ground: PALETTE["luz-suelo"], intensity: 1.15 },
    exposure: 1.05,
    impostor: { sky: 0xcfe6ff, ground: 0x85994f, hemiIntensity: 1.6, sun: 0xffe7bf, sunIntensity: 2.4 },
  },
  ground: {
    maps: { grass: "leafy_grass", sparse: "sparse_grass", dirt: "forest_ground_04", rock: "rock_face_03", rockAlt: "rocky_terrain" },
    vertex: { low: "suelo-bajo", high: "suelo-alto", alternate: "suelo-alterno", forest: "suelo-bosque", rock: "roca", rockWarm: "roca-calida" },
    grassGrade: { low: [0.17, 0.62, 0.2], high: [0.25, 0.68, 0.22], sparseGain: 1.45 },
  },
  vegetation: {
    species: TREE_SPECIES,
    leafGain: TREE_LEAF_GAIN,
    barkColor: TREE_BARK_COLOR,
    rockScans: ROCK_SCANS,
    textures: NATURE_TEXTURES,
    colors: NATURE_COLORS,
    density: { pines: 1, farPines: 1, broads: 1, bushes: 1, rocks: 1, ferns: 1, flowers: 1, pebbles: 1 },
  },
  characters: {
    rig: "quaternius",
    accessories: "v6",
    capColor: CAP_COLOR,
    bodies: BODY_IDS,
    shirts: SHIRT_TOKENS,
    hats: HATS,
    scarves: SCARVES,
  },
  // T8: los valores del pasto de la maqueta V6 (`world.js` grassAtlas, GRASS_VERT vTint, GRASS_FRAG y la cama del suelo).
  grass: {
    atlas: { base: 0x1f4f1c, mid: [0x4c9a2c, 0x6aa832], tips: [0xa9d65a, 0xc4d95c, 0x8fcb4e, 0xd8dc6a], flowers: [0xf6f2e6, 0xf3d34a, 0xe98fb5], flowerStem: 0x3f8a2c },
    blade: { base: [0.122, 0.31, 0.11], mid: [[0.298, 0.604, 0.173], [0.416, 0.659, 0.196]], tip: [[0.56, 0.8, 0.31], [0.85, 0.86, 0.42]] },
    tint: { dark: [0.62, 0.84, 0.66], warm: [1.2, 1.07, 0.6], gain: [0.9, 0.92, 0.8] },
    bed: [0.56, 1.08, 0.3],
    density: 1,
  },
  water: { shallow: "agua", deep: "agua-honda", glint: "brillo", fog: "bruma" },
  road: { surface: "camino", border: "tierra-borde", paving: "piedra" },
};

/** El look C de m7 de los dioramas planos (0034931): KayKit, y bruma de fondo y de niebla. */
export const PAINTED_LOOK: WorldLook = {
  ...DEFAULT_LOOK,
  id: "pintado",
  fog: { ...DEFAULT_LOOK.fog, color: PALETTE.bruma },
  background: PALETTE.bruma,
  characters: { ...DEFAULT_LOOK.characters, rig: "kaykit" },
};

export const WORLD_LOOKS: Readonly<Record<LookId, WorldLook>> = { pradera: DEFAULT_LOOK, pintado: PAINTED_LOOK };

/** El hex de un token en la paleta del look. */
export const lookHex = (look: Pick<WorldLook, "palette">, token: PaletteToken): string => look.palette[token];

/** La especie de cada clase en el orden del look (pinos, latifoliadas o arbustos). */
export const lookSpecies = (look: Pick<WorldLook, "vegetation">, kind: TreeSpecies["kind"]): TreeSpecies[] =>
  look.vegetation.species.filter((s) => s.kind === kind);

/** Los .glb de la naturaleza que baja el mundo abierto con este look (todos los tiers: el tier cambia cuántos, no cuáles). */
export const natureModelFiles = (look: WorldLook): string[] => [
  ...look.vegetation.species.flatMap((s) => [treeFile(s, false), treeFile(s, true)]),
  ...look.vegetation.rockScans.flatMap((r) => [rockFile(r.scan, false), rockFile(r.scan, true)]),
];

const all = (n: number): Record<WorldTier, number> => ({ low: n, medium: n, high: n });
const tiers = (low: number, medium: number, high: number): Record<WorldTier, number> => ({ low, medium, high });
const perTier = (on: (t: WorldTier) => boolean): Record<WorldTier, number> =>
  tiers(...(WORLD_TIERS.map((t) => (on(t) ? 1 : 0)) as [number, number, number]));

/**
 * El inventario de texturas del mundo abierto con este look (D-841; antes la constante OPEN_WORLD_TEXTURES): los mapas
 * del suelo de sus ranuras, el atlas de rocas, hoja y corteza de su vegetación y lo que se dibuja en tiempo de
 * ejecución. Medidas, formatos y conteos por tier son del núcleo (D-832, AC74); el look elige qué archivos.
 */
export function worldTextures(look: WorldLook): WorldTexture[] {
  const maps = [...new Set(Object.values(look.ground.maps))];
  const tex = look.vegetation.textures;
  return [
    ...maps.map((m): WorldTexture => ({
      id: `suelo/${m}-diff`, group: "suelo", width: GROUND_DIFFUSE_PX, height: GROUND_DIFFUSE_PX, mips: true, alpha: false,
      format: "etc1s", candidates: ["etc1s", "uastc", "rgba8"], count: all(1), file: groundTextureFile(m, "diff"), task: "T6",
    })),
    ...maps.map((m): WorldTexture => ({
      id: `suelo/${m}-nor`, group: "suelo", width: GROUND_NORMAL_PX, height: GROUND_NORMAL_PX, mips: true, alpha: false,
      format: "etc1s", candidates: ["uastc", "etc1s", "rgba8"], count: perTier((t) => OPEN_WORLD_DENSITY[t].groundNormals),
      file: groundTextureFile(m, "nor"), task: "T6", normal: true, v6Px: GROUND_NORMAL_V6_PX,
    })),
    // T7: un atlas 2 × 2 de los 4 escaneos de roca (difuso en todo tier, normal en medium y high: un material por banda,
    // AC71), hoja y corteza (PD-9). Archivos de scripts/assets/nature.ts.
    { id: "rocas/difuso", group: "rocas", width: 1024, height: 1024, mips: true, alpha: false, format: "etc1s", candidates: ["etc1s", "uastc"], count: all(1), file: tex.rockDiff, task: "T7" },
    { id: "rocas/normal", group: "rocas", width: 1024, height: 1024, mips: true, alpha: false, format: "etc1s", candidates: ["uastc", "etc1s"], count: tiers(0, 1, 1), file: tex.rockNor, task: "T7", normal: true },
    { id: "arboles/hoja", group: "árboles", width: 512, height: 512, mips: true, alpha: true, format: "etc1s", candidates: ["etc1s", "uastc", "rgba8"], count: all(1), file: tex.leaf, task: "T7" },
    { id: "arboles/corteza", group: "árboles", width: 512, height: 512, mips: true, alpha: false, format: "etc1s", candidates: ["etc1s", "uastc", "rgba8"], count: all(1), file: tex.bark, task: "T7" },
    {
      id: "impostores", group: "impostores", width: RUNTIME_TEXTURE_PX.impostor[0], height: RUNTIME_TEXTURE_PX.impostor[1], mips: true, alpha: true,
      format: "rgba8", candidates: ["rgba8"], count: all(IMPOSTOR_SPECIES), task: "T7",
    },
    {
      id: "flores", group: "detalle", width: RUNTIME_TEXTURE_PX.flowerAtlas[0], height: RUNTIME_TEXTURE_PX.flowerAtlas[1], mips: true, alpha: true,
      format: "rgba8", candidates: ["rgba8"], count: all(1), task: "T7",
    },
    // T8 (D-839): el atlas de matas se dibuja con los colores del look (`grass.atlas`); la medida es del núcleo.
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
      format: "rgba8", candidates: ["rgba8"], count: perTier((t) => OPEN_WORLD_DENSITY[t].clouds), task: "T6",
    },
  ];
}
