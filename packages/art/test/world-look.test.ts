// Open-world-3d T7b (LK1, D-838..D-842): el look del mundo. DEFAULT_LOOK es el mundo abierto tal como se dibuja en 0034931:
// cada campo está fijado acá al valor LITERAL que tenía su constante global en ese commit (PALETTE, SKY_TOKENS y FOG_RANGE
// de world/sky/palette.ts, SUN/HEMI/TONE de world/lighting/params.ts, las luces del horneado de world/nature/impostor.ts,
// GROUND_MAPS y GRASS_GRADE de world/terrain/groundMaterial.ts, TREE_SPECIES, TREE_LEAF_GAIN, TREE_BARK_COLOR, ROCK_SCANS,
// NATURE_TEXTURES y NATURE_COLORS de vegetation.ts, CAP_COLOR y los cuerpos de looks.ts, el atlas de nubes de
// world/sky/sky.ts). Si un valor cambia, cambia lo que se ve: este test lo frena.
import { describe, expect, test } from "vitest";
import {
  ACCESSORY_SETS, BODY_IDS, CHARACTER_RIGS, DEFAULT_LOOK, GROUND_MAPS, GROUND_SLOTS, HATS, LOOK_IDS, OPEN_WORLD_DENSITY, PAINTED_LOOK,
  PALETTE, SCARVES, SHIRT_TOKENS, TREE_SPECIES, WORLD_LOOKS, WORLD_TIERS, isPaletteToken, natureModelFiles, takeVegetation,
  worldTextures, type VegetationScatter, type VegetationSpot,
} from "../src/index.ts";

const PALETTE_0034931 = {
  pasto: "#93C25B", "pasto-luz": "#B9D86E", "pasto-sombra": "#5E9450", camino: "#E3C58E", "tierra-borde": "#B98F5A",
  orilla: "#D9C38C", "copa-luz": "#A9D35F", copa: "#6FAE4A", "copa-sombra": "#3F7A45", pino: "#3C7354", tronco: "#8A5A3B",
  agua: "#5FB8C9", "agua-honda": "#3A8FA8", brillo: "#E6F7F4", cielo: "#BFE3EC", bruma: "#F3E7CF", muro: "#F4EDE2",
  "casa-1": "#E9806E", "casa-2": "#F2CF6B", "casa-3": "#9ED8B8", "casa-4": "#9CC7E8", "casa-5": "#B9A6DB", "casa-6": "#F4EDE2",
  techo: "#C9624B", cumbrera: "#A84E3B", madera: "#9A6B43", "maíz": "#D9B65A", "hoja-maíz": "#8DBE57", ventana: "#FFD58A",
  papel: "#FBF6EC", tinta: "#2A2A33", "tinta-suave": "#5B5664", "ámbar": "#F2A93B", "ámbar-osc": "#B86E12", "chip-texto": "#2A1A05",
  "luz-bicho": "#FFD27A", piedra: "#C7BBA6", zocalo: "#B9A891", piel: "#E8B48F", "piel-2": "#C98E68", pelo: "#4A3326",
  "pelo-2": "#5A4636", pantalon: "#4F5D8C", "pantalon-2": "#7A5A3E", paja: "#E8C77A", gorra: "#4A86D9", mejilla: "#F2A08A",
  blanco: "#FFFFFF", "papel-borde": "#E6DCC8", "flor-centro": "#F7F2E6", chimenea: "#B98A6A", "suelo-bajo": "#4F9A35",
  "suelo-alto": "#7FB944", "suelo-alterno": "#93BE4A", "suelo-bosque": "#2F6A34", roca: "#8C928A", "roca-calida": "#9A8F80",
  "cielo-cenit": "#2F86D6", "cielo-medio": "#68B6EA", "cielo-horizonte": "#CFE7EE", sol: "#FFF1D6", "luz-cielo": "#D6ECF2",
  "luz-suelo": "#6E8B4A",
};

describe("LK1: DEFAULT_LOOK fija cada valor de 0034931", () => {
  test("paleta: la de palette.ts, token por token", () => {
    expect(DEFAULT_LOOK.palette).toEqual(PALETTE_0034931);
    expect(DEFAULT_LOOK.palette).toBe(PALETTE);
  });

  test("cielo, niebla y fondo (world/sky/palette.ts y sky.ts)", () => {
    expect(DEFAULT_LOOK.sky).toEqual({
      zenith: "#2F86D6", haze: "#68B6EA", horizon: "#CFE7EE",
      clouds: {
        cumulus: [[0, "rgba(255,255,255,0.9)"], [0.6, "rgba(250,252,255,0.55)"], [1, "rgba(240,246,252,0)"]],
        wisp: [[0, "rgba(255,255,255,0)"], [0.3, "rgba(255,255,255,0.8)"], [0.7, "rgba(255,255,255,0.7)"], [1, "rgba(255,255,255,0)"]],
        opacity: 0.97,
      },
    });
    expect(DEFAULT_LOOK.fog).toEqual({ color: "#CFE7EE", range: { near: [45, 520], far: [250, 1500] } });
    expect(DEFAULT_LOOK.background).toBe("#CFE7EE");
  });

  test("luz (world/lighting/params.ts y el horneado de impostores)", () => {
    expect(DEFAULT_LOOK.light).toEqual({
      sun: { color: "#FFF1D6", intensity: 2.3, elevationDeg: 48, azimuthDeg: -30 },
      hemi: { sky: "#D6ECF2", ground: "#6E8B4A", intensity: 1.15 },
      exposure: 1.05,
      impostor: { sky: 0xcfe6ff, ground: 0x85994f, hemiIntensity: 1.6, sun: 0xffe7bf, sunIntensity: 2.4 },
    });
  });

  test("suelo: los mapas en el orden de GROUND_MAPS, los colores por vértice y GRASS_GRADE", () => {
    expect(GROUND_SLOTS.map((s) => DEFAULT_LOOK.ground.maps[s])).toEqual(["leafy_grass", "sparse_grass", "forest_ground_04", "rock_face_03", "rocky_terrain"]);
    expect(GROUND_SLOTS.map((s) => DEFAULT_LOOK.ground.maps[s])).toEqual([...GROUND_MAPS]);
    expect(DEFAULT_LOOK.ground.vertex).toEqual({ low: "suelo-bajo", high: "suelo-alto", alternate: "suelo-alterno", forest: "suelo-bosque", rock: "roca", rockWarm: "roca-calida" });
    expect(DEFAULT_LOOK.ground.grassGrade).toEqual({ low: [0.17, 0.62, 0.2], high: [0.25, 0.68, 0.22], sparseGain: 1.45 });
  });

  test("vegetación: especies, ganancia, corteza, rocas, mapas, colores y densidad 1", () => {
    const v = DEFAULT_LOOK.vegetation;
    expect(v.species).toEqual([
      { name: "pineA", file: "pine-a", kind: "pine", height: 11.5, low: 0x1f5a45, high: 0x4f9a6a, tintSeed: 1 },
      { name: "pineB", file: "pine-b", kind: "pine", height: 13.5, low: 0x1b5440, high: 0x469468, tintSeed: 2 },
      { name: "pineC", file: "pine-c", kind: "pine", height: 8.5, low: 0x24604a, high: 0x58a070, tintSeed: 3 },
      { name: "oak", file: "oak", kind: "broad", height: 8.5, low: 0x4f8f35, high: 0xa4d05a, tintSeed: 11 },
      { name: "aspen", file: "aspen", kind: "broad", height: 10, low: 0x5c9a3a, high: 0xb6d85e, tintSeed: 12 },
      { name: "bushA", file: "bush-a", kind: "bush", height: 1.15, low: 0x4a8a35, high: 0x9ccb55, tintSeed: 21 },
      { name: "bushB", file: "bush-b", kind: "bush", height: 1.0, low: 0x558f38, high: 0xa8d25a, tintSeed: 22 },
    ]);
    expect(v.species).toBe(TREE_SPECIES); // el horneado (scripts/assets/bake-trees.ts) lee la misma lista
    expect(v.leafGain).toBe(3.4);
    expect(v.barkColor).toBe(0xcdbba4);
    // `meshes` es nuevo en T7b: era el literal `r.scan === "rock_moss_set_01" ? 6 : 1` de world/nature/buildNature.ts.
    expect(v.rockScans).toEqual([
      { scan: "rock_07", kind: "small", near: 900, far: 200, meshes: 1 },
      { scan: "rock_09", kind: "small", near: 900, far: 200, meshes: 1 },
      { scan: "rock_moss_set_01", kind: "small", near: 1800, far: 600, meshes: 6 },
      { scan: "rock_face_01", kind: "outcrop", near: 2200, far: 420, meshes: 1 },
    ]);
    expect(v.textures).toEqual({
      rockDiff: "apps/web/public/textures/rocas-diff.ktx2", rockNor: "apps/web/public/textures/rocas-nor.ktx2",
      leaf: "apps/web/public/textures/hoja-diff.ktx2", bark: "apps/web/public/textures/corteza-diff.ktx2",
    });
    expect(v.colors).toEqual({
      fern: { low: 0x3f7a2e, high: 0x8cbf4a },
      pebble: { rock: 0x8c928a, warm: 0x9a8f80, moss: 0x6f9a45 },
      flowerStem: [0x4f8a2e, 0x3f7426],
      flowerLeaf: 0x5c9a34,
      flowers: [
        { petal: 0xf7f4ea, centre: 0xf2c531, petals: 5, radius: 3.2 },
        { petal: 0xf5cf2a, centre: 0xd98c12, petals: 5, radius: 2.6 },
        { petal: 0xb79be6, centre: 0xf1e2a0, petals: 4, radius: 2.8 },
        { petal: 0xe5532d, centre: 0x2b1d14, petals: 4, radius: 3.6 },
      ],
      flowerTint: [[1, 1, 1], [1.05, 0.98, 0.92], [0.94, 1, 1.04], [1.08, 1.04, 0.96]],
    });
    expect(v.density).toEqual({ pines: 1, farPines: 1, broads: 1, bushes: 1, rocks: 1, ferns: 1, flowers: 1, pebbles: 1 });
  });

  test("pasto (T8, D-839): los valores de la maqueta V6 (world.js grassAtlas, GRASS_VERT, GRASS_FRAG y la cama del suelo)", () => {
    // El pasto no existía en 0034931: estos son los literales de la maqueta V6 que T8 sacó de world/ (D-838).
    expect(DEFAULT_LOOK.grass).toEqual({
      atlas: { base: 0x1f4f1c, mid: [0x4c9a2c, 0x6aa832], tips: [0xa9d65a, 0xc4d95c, 0x8fcb4e, 0xd8dc6a], flowers: [0xf6f2e6, 0xf3d34a, 0xe98fb5], flowerStem: 0x3f8a2c },
      blade: { base: [0.122, 0.31, 0.11], mid: [[0.298, 0.604, 0.173], [0.416, 0.659, 0.196]], tip: [[0.56, 0.8, 0.31], [0.85, 0.86, 0.42]] },
      tint: { dark: [0.62, 0.84, 0.66], warm: [1.2, 1.07, 0.6], gain: [0.9, 0.92, 0.8] },
      bed: [0.56, 1.08, 0.3],
      density: 1,
    });
    expect(PAINTED_LOOK.grass).toBe(DEFAULT_LOOK.grass); // el pintado lo hereda
  });

  test("personajes, agua y camino", () => {
    expect(DEFAULT_LOOK.characters).toEqual({
      rig: "quaternius", accessories: "v6", capColor: 0xd6342c, bodies: ["saco", "tunica", "ancho"],
      shirts: ["casa-1", "casa-2", "casa-3", "casa-4", "casa-5", "casa-6"], hats: ["gorra", "paja", "boina"], scarves: ["panuelo", "bufanda"],
    });
    expect(DEFAULT_LOOK.characters.bodies).toBe(BODY_IDS);
    expect(DEFAULT_LOOK.characters.shirts).toBe(SHIRT_TOKENS);
    expect(DEFAULT_LOOK.characters.hats).toBe(HATS);
    expect(DEFAULT_LOOK.characters.scarves).toBe(SCARVES);
    expect(DEFAULT_LOOK.water).toEqual({ shallow: "agua", deep: "agua-honda", glint: "brillo", fog: "bruma" });
    expect(DEFAULT_LOOK.road).toEqual({ surface: "camino", border: "tierra-borde", paving: "piedra" });
  });

  test("el look pintado de los dioramas planos: DEFAULT_LOOK con KayKit y bruma (lo que m7 dibujaba en 0034931)", () => {
    expect(PAINTED_LOOK.characters.rig).toBe("kaykit");
    expect(PAINTED_LOOK.fog).toEqual({ color: "#F3E7CF", range: { near: [45, 520], far: [250, 1500] } });
    expect(PAINTED_LOOK.background).toBe("#F3E7CF");
    const rest = (l: typeof DEFAULT_LOOK): Record<string, unknown> =>
      Object.fromEntries(Object.entries(l).filter(([k]) => !["id", "fog", "background", "characters"].includes(k)));
    expect(rest(PAINTED_LOOK)).toEqual(rest(DEFAULT_LOOK));
    expect({ ...PAINTED_LOOK.characters, rig: "quaternius" }).toEqual(DEFAULT_LOOK.characters);
  });
});

describe("el catálogo WORLD_LOOKS", () => {
  test("cada id es su clave, cada token existe en la paleta del look, rig y accesorios conocidos, densidad <= 1", () => {
    expect(Object.keys(WORLD_LOOKS)).toEqual([...LOOK_IDS]);
    expect(WORLD_LOOKS.pradera).toBe(DEFAULT_LOOK);
    for (const [id, look] of Object.entries(WORLD_LOOKS)) {
      expect(look.id).toBe(id);
      const tokens = [...Object.values(look.ground.vertex), ...Object.values(look.water), ...Object.values(look.road)];
      for (const t of tokens) expect(isPaletteToken(t) && look.palette[t] !== undefined, `${id}: ${t}`).toBe(true);
      expect(CHARACTER_RIGS).toContain(look.characters.rig);
      expect(ACCESSORY_SETS).toContain(look.characters.accessories);
      expect(look.grass.density).toBeGreaterThan(0);
      expect(look.grass.density).toBeLessThanOrEqual(1);
      for (const k of Object.values(look.vegetation.density)) {
        expect(k).toBeGreaterThan(0);
        expect(k).toBeLessThanOrEqual(1);
      }
      for (const s of GROUND_SLOTS) expect(GROUND_MAPS).toContain(look.ground.maps[s]);
      expect(natureModelFiles(look).length).toBe(look.vegetation.species.length * 2 + look.vegetation.rockScans.length * 2);
      expect(worldTextures(look).length).toBeGreaterThan(0);
    }
  });

  test("worldTextures(DEFAULT_LOOK) es el inventario de 0034931 (ids, archivos y conteos por tier)", () => {
    const inv = worldTextures(DEFAULT_LOOK).map((t) => `${t.id}|${t.file ?? "-"}|${t.width}x${t.height}|${t.format}|${WORLD_TIERS.map((k) => t.count[k]).join("/")}`);
    expect(inv).toEqual([
      ...GROUND_MAPS.map((m) => `suelo/${m}-diff|apps/web/public/textures/${m.replace(/_/g, "-")}-diff.ktx2|1024x1024|etc1s|1/1/1`),
      ...GROUND_MAPS.map((m) => `suelo/${m}-nor|apps/web/public/textures/${m.replace(/_/g, "-")}-nor.ktx2|512x512|etc1s|0/1/1`),
      "rocas/difuso|apps/web/public/textures/rocas-diff.ktx2|1024x1024|etc1s|1/1/1",
      "rocas/normal|apps/web/public/textures/rocas-nor.ktx2|1024x1024|etc1s|0/1/1",
      "arboles/hoja|apps/web/public/textures/hoja-diff.ktx2|512x512|etc1s|1/1/1",
      "arboles/corteza|apps/web/public/textures/corteza-diff.ktx2|512x512|etc1s|1/1/1",
      "impostores|-|512x256|rgba8|5/5/5",
      "flores|-|256x64|rgba8|1/1/1",
      "pasto/atlas|-|1024x256|rgba8|1/1/1",
      "pasto/altura|-|240x200|rg16f|1/1/1",
      "cielo/nubes|-|512x1280|rgba8|0/1/1",
    ]);
  });

  test("takeVegetation: sin multiplicadores (o con 1) da lo mismo; con 0,5 recorta lo de afuera y deja todo lo de adentro", () => {
    const spot = (x: number, i: number): VegetationSpot => ({ x, z: 0, s: 1, r: 0, v: i });
    const list = (n: number, inside: number): VegetationSpot[] => Array.from({ length: n }, (_, i) => spot(i < inside ? 0 : 500, i));
    const sc: VegetationScatter = { pines: list(200, 10), broads: list(40, 5), bushes: list(60, 0), rocks: list(60, 5), flowers: list(2000, 0), ferns: list(800, 0), pebbles: list(500, 0) };
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    for (const tier of WORLD_TIERS) {
      const base = takeVegetation(sc, bounds, tier);
      expect(takeVegetation(sc, bounds, tier, DEFAULT_LOOK.vegetation.density)).toEqual(base);
      const half = takeVegetation(sc, bounds, tier, { pines: 0.5, broads: 0.5, rocks: 0.5, flowers: 0.5, bushes: 2 });
      expect(half.flowers.length).toBe(Math.floor(OPEN_WORLD_DENSITY[tier].trees.flowers * 0.5));
      expect(half.bushes.length).toBe(base.bushes.length); // > 1 no agranda: el tope del tier es del núcleo
      expect(half.broads.filter((s) => s.x === 0).length).toBe(5); // lo de adentro siempre queda (AC46)
    }
  });
});
