// Open-world-3d T10-code (T10 (b), D-846): los factores de medición de desarrollo. Un registro (una entrada por factor),
// un lector puro de la query (desconocido se ignora, fuera de desarrollo no hay factores), los aplicadores a las perillas
// que ya existían, la escena armada con las perillas, y GameCanvas leyéndolo solo bajo `import.meta.env.DEV`.
import { DEFAULT_LOOK, OPEN_WORLD_DENSITY } from "@lg/art";
import { prepareDiorama, type DioramaLayout } from "@lg/core";
import { Material } from "three";
import { describe, expect, test } from "vitest";
import gameCanvasSource from "../src/world/GameCanvas.tsx?raw";
import { TIER_PARAMS } from "../src/services/quality";
import {
  composerWithFactors, DEV_FACTOR_NAMES, DEV_FACTORS, NO_DEV_FACTORS, parseDevFactors, sceneWithFactors, tierWithFactors,
} from "../src/world/budget/devFactors";
import { buildDioramaScene, treeLodFor } from "../src/world/dioramas/scene";
import { compiledUniverseClientContent } from "./helpers";

describe("registro", () => {
  test("una entrada por factor de T10 (b) (al menos 12 filas, antialias incluido)", () => {
    expect(DEV_FACTOR_NAMES).toEqual([
      "post-off", "composer-8bit", "msaa-0", "msaa-4", "aa-on", "aa-off", "shadows-none", "shadows-directional",
      "grass-off", "trees-light", "ground-normals-off", "dpr-1.0", "dpr-1.25", "impostors-only",
    ]);
    for (const n of DEV_FACTOR_NAMES) expect(Object.keys(DEV_FACTORS[n].effect).length, n).toBe(1);
  });
});

describe("parseDevFactors", () => {
  test("fuera de desarrollo no hay factores, aunque la query los pida", () => {
    expect(parseDevFactors("?factor=grass-off,post-off", false)).toBe(NO_DEV_FACTORS);
    expect(NO_DEV_FACTORS).toEqual({ names: [], effect: {} });
  });

  test("un nombre desconocido se ignora; sin ninguno conocido, ninguno", () => {
    expect(parseDevFactors("?factor=bogus,grass-off,GRASS-OFF", true)).toEqual({ names: ["grass-off"], effect: { grass: false } });
    expect(parseDevFactors("?factor=bogus", true)).toBe(NO_DEV_FACTORS);
    expect(parseDevFactors("", true)).toBe(NO_DEV_FACTORS);
    expect(parseDevFactors("?toString=1&factor=__proto__,constructor", true)).toBe(NO_DEV_FACTORS);
  });

  test("coma o parámetro repetido, sin repetir, en orden; en la misma perilla gana el último", () => {
    const set = parseDevFactors("?universe=U&factor=aa-on,%20post-off&factor=aa-off&factor=post-off", true);
    expect(set.names).toEqual(["aa-on", "post-off", "aa-off"]);
    expect(set.effect).toEqual({ antialias: false, post: "none" });
  });
});

describe("aplicadores", () => {
  test("tier: post, sombras y maxDpr; sin factores de tier, el mismo objeto y nada mutado", () => {
    const medium = TIER_PARAMS.medium;
    const before = JSON.stringify(medium);
    expect(tierWithFactors(medium, { grass: false })).toBe(medium);
    expect(tierWithFactors(medium, parseDevFactors("?factor=post-off,shadows-directional,dpr-1.0", true).effect))
      .toEqual({ ...medium, post: "none", shadows: "directional", maxDpr: 1 });
    expect(tierWithFactors(medium, DEV_FACTORS["dpr-1.25"].effect).maxDpr).toBe(1.25);
    expect(JSON.stringify(medium)).toBe(before);
  });

  test("composer: por defecto multisampling 0 y sin 8 bits (lo de antes de T10)", () => {
    expect(composerWithFactors({})).toEqual({ multisampling: 0, eightBit: false });
    expect(composerWithFactors(parseDevFactors("?factor=msaa-4,composer-8bit", true).effect)).toEqual({ multisampling: 4, eightBit: true });
  });

  test("escena: solo los campos que un factor nombra", () => {
    expect(sceneWithFactors({ post: "none" })).toEqual({});
    expect(sceneWithFactors(parseDevFactors("?factor=grass-off,ground-normals-off,impostors-only", true).effect))
      .toEqual({ grass: false, groundNormals: false, treeBand: "impostor" });
  });

  test("bandas de árboles sobre los radios del tier", () => {
    expect(treeLodFor("medium", undefined)).toBe(OPEN_WORLD_DENSITY.medium.treeLod);
    expect(treeLodFor("medium", "light")).toEqual({ full: 0, mid: OPEN_WORLD_DENSITY.medium.treeLod.mid });
    expect(treeLodFor("high", "impostor")).toEqual({ full: 0, mid: 0 });
  });
});

describe("la escena con las perillas (muelle, medium)", () => {
  const layouts = compiledUniverseClientContent("U-GALEANO")["dioramas.json"] as DioramaLayout[];
  const muelle = prepareDiorama(layouts.find((d) => d.id === "muelle") as DioramaLayout);

  test("sin pasto, suelo sin normales y solo impostores; sin perillas, lo del tier", () => {
    // Los uniforms de la naturaleza entran por onBeforeCompile: se lo llama con un sombreador de mentira y se lee uLod.
    const lodOf = (s: ReturnType<typeof buildDioramaScene>): number[] => {
      let lod: number[] = [];
      s.nature?.group.traverse((o) => {
        const m = (o as { material?: Material }).material;
        if (!m || Array.isArray(m) || lod.length > 0 || m.onBeforeCompile === Material.prototype.onBeforeCompile) return;
        const sh = { uniforms: {} as Record<string, { value: { x: number; y: number } }>, vertexShader: "", fragmentShader: "" };
        m.onBeforeCompile(sh as unknown as Parameters<Material["onBeforeCompile"]>[0], undefined as never);
        const u = sh.uniforms["uLod"];
        if (u) lod = [u.value.x, u.value.y];
      });
      return lod;
    };
    const plain = buildDioramaScene(muelle, "full", "medium", DEFAULT_LOOK);
    const knobs = buildDioramaScene(muelle, "full", "medium", DEFAULT_LOOK, { grass: false, groundNormals: false, treeBand: "impostor" });
    try {
      expect(plain.grass).not.toBeNull();
      expect(plain.ground?.material.customProgramCacheKey()).toBe("terreno-n");
      expect(lodOf(plain)).toEqual([OPEN_WORLD_DENSITY.medium.treeLod.full, OPEN_WORLD_DENSITY.medium.treeLod.mid]);
      expect(knobs.grass).toBeNull();
      expect(knobs.root.getObjectByName("pasto")).toBeUndefined();
      expect(knobs.ground?.material.customProgramCacheKey()).toBe("terreno-s");
      expect(lodOf(knobs)).toEqual([0, 0]);
    } finally {
      plain.dispose();
      knobs.dispose();
    }
  });
});

describe("GameCanvas: los factores solo en desarrollo", () => {
  test("el registro se lee bajo import.meta.env.DEV y cada uso queda en la rama del null", () => {
    expect(gameCanvasSource).toContain('const FACTORS = import.meta.env.DEV ? parseDevFactors(globalThis.location?.search ?? "", true) : null;');
    expect(gameCanvasSource).toContain("const params = FACTORS ? tierWithFactors(tierParams[render.tier], FACTORS.effect) : tierParams[render.tier];");
    expect(gameCanvasSource).toContain("gl={{ antialias: FACTORS?.effect.antialias ?? false }}");
    // Ningún otro llamado a los aplicadores fuera de esa rama.
    expect(gameCanvasSource.match(/parseDevFactors\(/g)).toHaveLength(1);
  });
});
