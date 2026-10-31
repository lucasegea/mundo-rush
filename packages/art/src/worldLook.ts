// @lg/art worldLook.ts: the world look (open-world-3d T7b, D-838..D-842, architecture review 2026-10-29 "Per-universe world look").
// The world engine (terrain shape and relief, planting, culling and LOD, per-tier caps, camera, material classes and
// shader code, interface and label colors) is a single one; what changes from one universe to
// another (a horror book will have a horror world) is the LOOK: palette, sky and fog, light, ground maps and grade,
// vegetation, characters, water and path. A look is pure data (no three) and world/ receives it as a parameter: nothing in
// world/ imports these values as global constants or writes a hex (D-838, apps/web test).
//
// The catalog is fixed (`WORLD_LOOKS`). In T7b it has the two looks the game already draws at 0034931, with no new value:
//   · `pradera` (DEFAULT_LOOK): the open world of the V6 diorama (Quaternius, sky, ground maps, forest)
//   · `pintado`: the m7 look C of the flat dioramas (KayKit, background haze and fog); it is DEFAULT_LOOK with those
//     three differences, which until 0034931 were chosen with `relieve` in each component (D-840 takes them out of there).
// T7b SEAM (deferred by the plan): the universe manifest's `look` field, the per-look asset folders, the
// per-look validation of hats and bodies in the sheets and the new looks of the catalog.
// T8 (D-839): the `grass` block (atlas and blade colors, patch tint, bed tint, tuft
// multiplier); world/nature/grass.ts and the ground bed read it as uniforms and texture. T9 SEAM (D-839): the minimap colors (ground, path, water) come from
// the look's `palette`/`road`/`water`; the NPC dot is core and its contrast >= 3:1 is tested against each look.
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

/** The character skeletons a look can ask for (world/actors/rigs.ts has the specification of each one). */
export const CHARACTER_RIGS = ["kaykit", "quaternius"] as const;
export type CharacterRig = (typeof CHARACTER_RIGS)[number];
/** The code accessory sets (world/actors/accessories.ts: one table per set, not a switch). */
export const ACCESSORY_SETS = ["v6"] as const;
export type AccessorySetId = (typeof ACCESSORY_SETS)[number];

/** The five ground splat slots (the shader is a single one; the look chooses which map goes in each slot). */
export const GROUND_SLOTS = ["grass", "sparse", "dirt", "rock", "rockAlt"] as const;
export type GroundSlot = (typeof GROUND_SLOTS)[number];

export type Vec3 = readonly [number, number, number];
/** Fog up close (t = 0) and at the whole map (t = 1) of the continuous zoom, before the tier scale (AC40). */
export interface FogRange {
  near: readonly [number, number];
  far: readonly [number, number];
}
/** A gradient stop of the cloud atlas: [position 0..1, CSS color with alpha]. */
export type CloudStop = readonly [number, string];

/** A rock scan of the look (those of vegetation.ts ROCK_SCANS): near/far mesh and how many variants it draws. */
export interface RockScanSpec {
  scan: RockScan;
  kind: "small" | "outcrop";
  near: number;
  far: number;
  meshes: number;
}

/** The colors of the code-made detail (the shape of vegetation.ts NATURE_COLORS, without the literals). */
export interface NatureColorSet {
  fern: { low: number; high: number };
  pebble: { rock: number; warm: number; moss: number };
  flowerStem: readonly number[];
  flowerLeaf: number;
  flowers: readonly { petal: number; centre: number; petals: number; radius: number }[];
  flowerTint: readonly (readonly [number, number, number])[];
}

/** A look's grass block (T8): see `WorldLook.grass`. */
export interface GrassLook {
  /** Card atlas (4 variants of 256 px): foot of each blade, two middles, four tips, flower specks and their stem. */
  atlas: { base: number; mid: readonly [number, number]; tips: readonly [number, number, number, number]; flowers: readonly [number, number, number]; flowerStem: number };
  /** Real blades near the player (sRGB 0..1): foot, middle (two), tip (two, depending on the blade). */
  blade: { base: Vec3; mid: readonly [Vec3, Vec3]; tip: readonly [Vec3, Vec3] };
  /** Patch tint: from `dark` to `warm` according to a large pattern, by `gain`. */
  tint: { dark: Vec3; warm: Vec3; gain: Vec3 };
  /** Multiplier of the ground color under the grass disc (the bed, ground shader `uBedTint`). */
  bed: Vec3;
  /** Multiplier of the tier's tufts (<= 1). */
  density: number;
}

export interface WorldLook {
  id: LookId;
  /** The palette's hex values (palette.ts). Each diorama's `paleta` re-points names INSIDE this palette. */
  palette: Readonly<Record<PaletteToken, string>>;
  /** The dome (top to bottom) and the open world's cloud atlas (world/sky). */
  sky: {
    zenith: string;
    haze: string;
    horizon: string;
    clouds: { cumulus: readonly CloudStop[]; wisp: readonly CloudStop[]; opacity: number };
  };
  /** Fog color and its range with zoom (AC38, AC40); `background` is the canvas background. */
  fog: { color: string; range: FogRange };
  background: string;
  /** Scene light (proposal C §5), the output tone and the impostor-baking lights (T7). */
  light: {
    sun: { color: string; intensity: number; elevationDeg: number; azimuthDeg: number };
    hemi: { sky: string; ground: string; intensity: number };
    exposure: number;
    impostor: { sky: number; ground: number; hemiIntensity: number; sun: number; sunIntensity: number };
  };
  /** Open-world ground: map per slot, per-vertex colors (tokens) and grass grade (uniforms, D-842). */
  ground: {
    maps: Readonly<Record<GroundSlot, GroundMap>>;
    vertex: Readonly<Record<"low" | "high" | "alternate" | "forest" | "rock" | "rockWarm", PaletteToken>>;
    grassGrade: { low: Vec3; high: Vec3; sparseGain: number };
  };
  /**
   * Forest and detail of the open world. Each species names its ez-tree preset (`name`, scripts/assets/tree-presets.ts)
   * and its baked file. `density` multiplies the counts of each tier (<= 1: the tier's cap is the core's; what is
   * inside the bounds always stays, because the core's grid blocks those trunks, AC46).
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
  /** Characters: skeleton, accessory set, player cap and what a sheet can ask for (bodies, clothing). */
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
   * V6 grass of the open world (open-world-3d T8, D-839): colors of the tuft atlas (drawn by code), colors of
   * the real blades (sRGB 0..1; the shader linearizes them), the large patch tint (dark to warm, with its
   * gain), the ground's grass-bed tint and a tuft multiplier <= 1 (the tier's cap is the core's).
   * Everything comes in as uniforms or as a texture (D-842): two looks share the two grass programs.
   */
  grass: GrassLook;
  /** Water (palette tokens): bands, shine and its shader's own haze. */
  water: { shallow: PaletteToken; deep: PaletteToken; glint: PaletteToken; fog: PaletteToken };
  /** Path (tokens): the surface, the noisy edge and the cobblestone. */
  road: { surface: PaletteToken; border: PaletteToken; paving: PaletteToken };
}

/** The V6 diorama's open world as it stands at 0034931 (each value is that of its constant back then). */
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
  // The dome's horizon IS the fog and the background (AC38).
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
  // T8: the V6 diorama's grass values (`world.js` grassAtlas, GRASS_VERT vTint, GRASS_FRAG and the ground bed).
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

/** The m7 look C of the flat dioramas (0034931): KayKit, and background and fog haze. */
export const PAINTED_LOOK: WorldLook = {
  ...DEFAULT_LOOK,
  id: "pintado",
  fog: { ...DEFAULT_LOOK.fog, color: PALETTE.bruma },
  background: PALETTE.bruma,
  characters: { ...DEFAULT_LOOK.characters, rig: "kaykit" },
};

export const WORLD_LOOKS: Readonly<Record<LookId, WorldLook>> = { pradera: DEFAULT_LOOK, pintado: PAINTED_LOOK };

/**
 * The single rule for which look a diorama takes until the manifest names its own (LK3, manager amendment): with
 * relief the open world (DEFAULT_LOOK), flat the painted one. Open-world-3d T9: it lives here (not in world/dioramas/look.ts,
 * which calls it) because the ui/ minimap also paints with the diorama's look and ui/ does not import world/ (R3).
 */
export const lookForRelief = (relief: boolean): WorldLook => (relief ? DEFAULT_LOOK : PAINTED_LOOK);

/** The hex of a token in the look's palette. */
export const lookHex = (look: Pick<WorldLook, "palette">, token: PaletteToken): string => look.palette[token];

/** The species of each class in the look's order (pines, broadleaves or shrubs). */
export const lookSpecies = (look: Pick<WorldLook, "vegetation">, kind: TreeSpecies["kind"]): TreeSpecies[] =>
  look.vegetation.species.filter((s) => s.kind === kind);

/** The .glb files of nature that the open world downloads with this look (all tiers: the tier changes how many, not which). */
export const natureModelFiles = (look: WorldLook): string[] => [
  ...look.vegetation.species.flatMap((s) => [treeFile(s, false), treeFile(s, true)]),
  ...look.vegetation.rockScans.flatMap((r) => [rockFile(r.scan, false), rockFile(r.scan, true)]),
];

const all = (n: number): Record<WorldTier, number> => ({ low: n, medium: n, high: n });
const tiers = (low: number, medium: number, high: number): Record<WorldTier, number> => ({ low, medium, high });
const perTier = (on: (t: WorldTier) => boolean): Record<WorldTier, number> =>
  tiers(...(WORLD_TIERS.map((t) => (on(t) ? 1 : 0)) as [number, number, number]));

/**
 * The open world's texture inventory with this look (D-841; formerly the OPEN_WORLD_TEXTURES constant): the
 * ground maps of its slots, the rock, leaf and bark atlas of its vegetation and what is drawn at
 * runtime. Measurements, formats and per-tier counts are the core's (D-832, AC74); the look chooses which files.
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
    // T7: a 2 × 2 atlas of the 4 rock scans (diffuse in every tier, normal in medium and high: one material per band,
    // AC71), leaf and bark (PD-9). Files from scripts/assets/nature.ts.
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
    // T8 (D-839): the tuft atlas is drawn with the look's colors (`grass.atlas`); the measurement is the core's.
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
