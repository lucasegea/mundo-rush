// Open-world-3d T7b (D-838..D-842): el look del mundo como parámetro.
//   · LK3: el look se resuelve una vez por diorama (lookForDiorama) y baja a la escena; el esqueleto de los personajes es
//     `look.characters.rig` (un look de prueba con otro esqueleto lo elige con el mismo relieve; cambiar el relieve no
//     cambia el esqueleto); los accesorios son una tabla por look; queda una sola `fogFor`.
//   · LK5: dos looks (DEFAULT_LOOK y uno de prueba teñido) dan los mismos programas de sombreador: difieren en uniforms.
//   · D-839: world/ no importa los valores del look como constantes globales (solo dioramas/look.ts conoce el catálogo).
//   · Las fichas de NPC (campesino y Galeano) siguen siendo válidas contra los personajes de DEFAULT_LOOK.
import {
  ACCESSORY_SETS, DEFAULT_LOOK, natureModelFiles, PAINTED_LOOK, parseApariencia, WORLD_LOOKS, WORLD_TIERS, worldTextures, type LookId,
  type WorldLook,
} from "@lg/art";
import { prepareDiorama, type DioramaLayout, type DioramaRuntime } from "@lg/core";
import {
  MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, ShaderLib, ShaderMaterial, Vector3, type Material,
} from "three";
import { describe, expect, test } from "vitest";
import { ACCESSORY_TABLE, openWorldAccessories } from "../src/world/actors/accessories";
import { actorRig } from "../src/world/actors/rigs";
import { lookForDiorama } from "../src/world/dioramas/look";
import { buildDioramaScene } from "../src/world/dioramas/scene";
import { groundMapsFor } from "../src/world/terrain/groundMaterial";
import { compiledClientContent, compiledUniverseClientContent, contentLooks } from "./helpers";

const WORLD_SOURCES = import.meta.glob("../src/world/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const rel = (p: string): string => p.replace(/^.*\/src\/world\//, "");
const source = (file: string): string => {
  const hit = Object.entries(WORLD_SOURCES).find(([p]) => rel(p) === file);
  if (!hit) throw new Error(`no existe world/${file}`); // lección F1.1a: el marcador del archivo existe antes de mirarlo
  return hit[1];
};

const galeano = compiledUniverseClientContent("U-GALEANO");
const muelleLayout = (): DioramaLayout => (galeano["dioramas.json"] as DioramaLayout[]).find((d) => d.id === "muelle") as DioramaLayout;
const muelle = (): DioramaRuntime => prepareDiorama(muelleLayout());
const flatTest = (): DioramaRuntime => prepareDiorama((compiledClientContent()["dioramas.json"] as DioramaLayout[]).find((d) => d.id === "test") as DioramaLayout);

/** Un look de prueba (no del catálogo) con el esqueleto de los dioramas planos y todo lo demás de DEFAULT_LOOK. */
const KAYKIT_TEST_LOOK: WorldLook = { ...DEFAULT_LOOK, id: "prueba-kaykit" as LookId, characters: { ...DEFAULT_LOOK.characters, rig: "kaykit" } };

/** Un look de prueba teñido: otros colores, otro grado, otra ganancia de hoja, otra luz; los mismos archivos. */
const TINTED_LOOK: WorldLook = {
  ...DEFAULT_LOOK,
  id: "prueba-tenido" as LookId,
  palette: { ...DEFAULT_LOOK.palette, "suelo-bajo": "#3A2F4A", pasto: "#55506A", agua: "#20303A" },
  sky: { ...DEFAULT_LOOK.sky, zenith: "#1A1424", haze: "#3B2F4F", horizon: "#6A5A7A", clouds: { ...DEFAULT_LOOK.sky.clouds, opacity: 0.6 } },
  fog: { color: "#6A5A7A", range: { near: [20, 200], far: [120, 900] } },
  background: "#6A5A7A",
  light: { ...DEFAULT_LOOK.light, exposure: 0.8, impostor: { ...DEFAULT_LOOK.light.impostor, sun: 0x9080a0 } },
  ground: { ...DEFAULT_LOOK.ground, grassGrade: { low: [0.3, 0.3, 0.4], high: [0.4, 0.35, 0.5], sparseGain: 1.1 } },
  vegetation: {
    ...DEFAULT_LOOK.vegetation, leafGain: 2.2,
    colors: { ...DEFAULT_LOOK.vegetation.colors, fern: { low: 0x302838, high: 0x605070 } },
    density: { ...DEFAULT_LOOK.vegetation.density, flowers: 0.5 },
  },
  characters: { ...DEFAULT_LOOK.characters, capColor: 0x402060 },
  // T8 (D-839): otro pasto, por uniforms y atlas.
  grass: { ...DEFAULT_LOOK.grass, tint: { ...DEFAULT_LOOK.grass.tint, warm: [0.7, 0.6, 0.9] }, bed: [0.5, 0.5, 0.7], density: 0.5 },
};

describe("LK3: el look se resuelve una vez por diorama y baja como parámetro", () => {
  test("lookForDiorama: el muelle (relieve) toma DEFAULT_LOOK; los planos y el canvas sin diorama, el pintado", () => {
    expect(lookForDiorama(muelle())).toBe(DEFAULT_LOOK);
    expect(lookForDiorama(flatTest())).toBe(PAINTED_LOOK);
    expect(lookForDiorama(null)).toBe(PAINTED_LOOK);
    // La escena guarda el look con el que se armó; sin look explícito, el de lookForDiorama.
    const s = buildDioramaScene(muelle(), "reduced", "low");
    expect(s.look).toBe(DEFAULT_LOOK);
    s.dispose();
  });

  test("un look de prueba con otro esqueleto lo elige con el mismo relieve; cambiar el relieve no cambia el esqueleto", () => {
    const withRelief = buildDioramaScene(muelle(), "reduced", "low", KAYKIT_TEST_LOOK);
    expect(withRelief.picker).not.toBeNull(); // relieve: sí
    expect(actorRig(withRelief.look.characters)).toBe("kaykit");
    withRelief.dispose();
    const base = muelleLayout();
    const flatMuelle = prepareDiorama({ ...base, terreno: { ...base.terreno, relieve: false } });
    for (const look of [DEFAULT_LOOK, KAYKIT_TEST_LOOK]) {
      const on = buildDioramaScene(muelle(), "reduced", "low", look);
      const off = buildDioramaScene(flatMuelle, "reduced", "low", look);
      expect(on.picker).not.toBeNull();
      expect(off.picker).toBeNull(); // el relieve sí cambió la forma
      expect(actorRig(off.look.characters)).toBe(actorRig(on.look.characters));
      expect(actorRig(on.look.characters)).toBe(look.characters.rig);
      on.dispose();
      off.dispose();
    }
  });

  test("nadie deduce el esqueleto del relieve: Diorama y GameCanvas pasan los personajes del look", () => {
    for (const f of ["dioramas/Diorama.tsx", "GameCanvas.tsx"]) {
      const s = source(f);
      expect(s, f).not.toMatch(/actorRig\(/);
      expect(s, f).not.toMatch(/\brig=\{/);
      expect(s, f).toMatch(/cast=\{(scene\.look|look)\.characters\}|cast=\{cast\}/);
      expect(s, f).not.toMatch(/cast=\{[^}]*(relief|openWorld|picker)/);
    }
    expect(source("actors/rigs.ts")).toMatch(/export const actorRig = \(cast: WorldLook\["characters"\] \| null \| undefined\): RigId => cast\?\.rig \?\? "kaykit";/);
    // LK3 enmendado: en el punto de uso (Character) el esqueleto sale solo de `cast`, por actorRig; la línea que lo elige
    // no nombra distanceRules, relieve ni mundo abierto (character-rig.test.tsx lo prueba montando el componente).
    const character = source("actors/Character.tsx");
    const rigLines = character.split(/\r?\n/).filter((l) => /\bconst rig\b/.test(l));
    expect(rigLines).toEqual(["  const rig: RigId = actorRig(cast);"]);
  });

  test("los accesorios son una tabla por juego del look (sin switch); la gorra toma el color del look", () => {
    expect(Object.keys(ACCESSORY_TABLE)).toEqual([...ACCESSORY_SETS]);
    expect(source("actors/accessories.ts")).not.toMatch(/\bswitch\s*\(/);
    const look = { body: "tunica", shirt: "casa-1", pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "casquete", hat: "gorra", scarf: "bufanda", scale: 1 } as const;
    const a = openWorldAccessories(look, DEFAULT_LOOK.characters);
    const b = openWorldAccessories(look, TINTED_LOOK.characters);
    expect(a.head && a.neck && b.head).toBeTruthy();
    const first = (g: typeof a.head): number[] => [...(g?.getAttribute("color").array.slice(0, 3) ?? [])];
    expect(first(a.head)).not.toEqual(first(b.head)); // otro capColor, otra gorra
    expect(openWorldAccessories({ ...look, hat: null, scarf: "panuelo" }, DEFAULT_LOOK.characters)).toEqual({ head: null, neck: null });
  });

  test("una sola fogFor en world/ (la del zoom, con el rango del look); lighting/params.ts ya no tiene la de D-208", () => {
    const defs = Object.entries(WORLD_SOURCES).filter(([, s]) => /export function fogFor\(/.test(s)).map(([p]) => rel(p));
    expect(defs).toEqual(["sky/palette.ts"]);
    expect(source("sky/palette.ts")).toMatch(/export function fogFor\(range: FogRange, scale: number, t: number\)/);
  });
});

describe("LK4 (D-841): los inventarios y los mapas del suelo siguen al look", () => {
  /** Un look de prueba: rockAlt toma el mapa de rock (rocky_terrain sale) y se cae la primera especie de árbol. */
  const SWAPPED: WorldLook = {
    ...DEFAULT_LOOK,
    id: "prueba-cambiado" as LookId,
    ground: { ...DEFAULT_LOOK.ground, maps: { ...DEFAULT_LOOK.ground.maps, rockAlt: DEFAULT_LOOK.ground.maps.rock } },
    vegetation: { ...DEFAULT_LOOK.vegetation, species: DEFAULT_LOOK.vegetation.species.slice(1) },
  };
  const dropped = DEFAULT_LOOK.ground.maps.rockAlt;

  test("worldTextures, natureModelFiles y groundMapsFor de un look con un mapa cambiado y una especie menos", () => {
    expect(dropped).not.toBe(DEFAULT_LOOK.ground.maps.rock); // el cambio no es vacuo
    const ids = (look: WorldLook): string[] => worldTextures(look).map((t) => t.id);
    expect(ids(DEFAULT_LOOK).some((id) => id.startsWith(`suelo/${dropped}-`))).toBe(true);
    expect(ids(SWAPPED).some((id) => id.startsWith(`suelo/${dropped}-`))).toBe(false);
    expect(ids(SWAPPED).filter((id) => id.startsWith("suelo/"))).toHaveLength(ids(DEFAULT_LOOK).filter((id) => id.startsWith("suelo/")).length - 2);

    const files = natureModelFiles(SWAPPED);
    const gone = natureModelFiles(DEFAULT_LOOK).filter((f) => !files.includes(f));
    expect(gone).toHaveLength(2); // la especie caída, completa y simplificada
    expect(files).toHaveLength(natureModelFiles(DEFAULT_LOOK).length - 2);

    for (const tier of WORLD_TIERS) {
      const maps = groundMapsFor(tier, SWAPPED);
      expect(maps.filter((m) => m.slot === "rockAlt").every((m) => m.map === DEFAULT_LOOK.ground.maps.rock), tier).toBe(true);
      expect(maps.some((m) => m.map === dropped), tier).toBe(false);
      expect(groundMapsFor(tier, DEFAULT_LOOK).some((m) => m.slot === "rockAlt" && m.map === dropped), tier).toBe(true);
    }
  });
});

describe("D-839: world/ lee el look por parámetro, no como constante global", () => {
  test("solo dioramas/look.ts nombra el catálogo; ningún módulo importa los valores que pasaron al look", () => {
    const banned = new Set([
      "DEFAULT_LOOK", "PAINTED_LOOK", "WORLD_LOOKS", "NATURE_COLORS", "NATURE_TEXTURES", "TREE_SPECIES", "ROCK_SCANS", "CAP_COLOR",
      "TREE_LEAF_GAIN", "TREE_BARK_COLOR", "GROUND_MAPS", "natureModelFiles",
    ]);
    /** Los nombres que un archivo importa de @lg/art (los comentarios pueden nombrar el look; importarlo no). */
    const artImports = (s: string): string[] =>
      [...s.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"@lg\/art"/g)].flatMap((m) => (m[1] ?? "").split(",").map((x) => x.replace(/^\s*type\s+/, "").trim().split(/\s+as\s+/)[0] ?? "").filter(Boolean));
    const files = Object.entries(WORLD_SOURCES).map(([p, s]) => [rel(p), artImports(s)] as const);
    expect(files.length).toBeGreaterThan(60);
    expect(artImports(source("dioramas/look.ts"))).toEqual(expect.arrayContaining(["DEFAULT_LOOK", "PAINTED_LOOK"]));
    expect(files.filter(([f, names]) => f !== "dioramas/look.ts" && names.some((n) => banned.has(n))).map(([f, names]) => `${f}: ${names.filter((n) => banned.has(n)).join(", ")}`)).toEqual([]);
    // PALETTE (los hex) solo en las etiquetas y balizas, que son interfaz (A14, núcleo): el resto lee look.palette.
    expect(files.filter(([f, names]) => !f.startsWith("labels/") && names.includes("PALETTE")).map(([f]) => f)).toEqual([]);
    expect(files.filter(([, names]) => names.includes("PALETTE")).length).toBeGreaterThan(0); // el detector ve imports
  });
});

/** La firma de programa de un material: clase, clave de caché y el sombreador que sale de su onBeforeCompile. */
function programSignature(m: Material): { sig: string; uniforms: Record<string, unknown> } {
  const lib = m instanceof MeshToonMaterial ? ShaderLib.toon : m instanceof MeshStandardMaterial ? ShaderLib.standard : m instanceof MeshBasicMaterial ? ShaderLib.basic : null;
  const sh = m instanceof ShaderMaterial
    ? { uniforms: m.uniforms as Record<string, { value: unknown }>, vertexShader: m.vertexShader, fragmentShader: m.fragmentShader }
    : { uniforms: {} as Record<string, { value: unknown }>, vertexShader: lib?.vertexShader ?? "", fragmentShader: lib?.fragmentShader ?? "" };
  m.onBeforeCompile(sh as never, null as never);
  const own = Object.hasOwn(m, "customProgramCacheKey") ? m.customProgramCacheKey() : "-";
  const flags = [m.type, m.transparent, m.side, (m as { vertexColors?: boolean }).vertexColors ?? false, m.alphaTest].join(",");
  return { sig: `${own}|${flags}|${sh.vertexShader}|${sh.fragmentShader}`, uniforms: Object.fromEntries(Object.entries(sh.uniforms).map(([k, u]) => [k, u.value])) };
}

const materialsOf = (scene: ReturnType<typeof buildDioramaScene>): Material[] => {
  const mats = new Set<Material>();
  scene.root.traverse((o) => {
    const m = (o as { material?: Material | Material[] }).material;
    for (const x of Array.isArray(m) ? m : m ? [m] : []) mats.add(x);
  });
  return [...mats];
};

describe("LK5 (D-842): los looks difieren solo en uniforms, nunca en variantes de sombreador", () => {
  for (const tier of WORLD_TIERS) {
    test(`${tier}: DEFAULT_LOOK y un look teñido dan los mismos programas y claves de caché (y otros uniforms)`, () => {
      const a = buildDioramaScene(muelle(), tier === "low" ? "reduced" : "full", tier, DEFAULT_LOOK);
      const b = buildDioramaScene(muelle(), tier === "low" ? "reduced" : "full", tier, TINTED_LOOK);
      const sa = materialsOf(a).map(programSignature);
      const sb = materialsOf(b).map(programSignature);
      expect(new Set(sb.map((x) => x.sig))).toEqual(new Set(sa.map((x) => x.sig)));
      expect(sa.length).toBeGreaterThan(8);
      // No vacuo: el teñido sí llega a los uniforms (grado del pasto, ganancia de la hoja) y a los colores del cielo.
      const ground = (s: typeof sa) => s.find((x) => x.uniforms["uGrassLow"] !== undefined)?.uniforms;
      expect((ground(sa)?.["uGrassLow"] as Vector3).toArray()).toEqual([0.17, 0.62, 0.2]);
      expect((ground(sb)?.["uGrassLow"] as Vector3).toArray()).toEqual([0.3, 0.3, 0.4]);
      const leaf = (s: typeof sa) => s.find((x) => x.uniforms["uLeafGain"] !== undefined)?.uniforms["uLeafGain"];
      expect([leaf(sa), leaf(sb)]).toEqual([3.4, 2.2]);
      // T8: el pasto teñido llega a sus uniforms (tinte de parches) y a la cama del suelo; sus dos programas son los mismos.
      const warm = (s: typeof sa) => s.filter((x) => x.uniforms["uTintWarm"] !== undefined).map((x) => (x.uniforms["uTintWarm"] as Vector3).toArray());
      expect(warm(sa)).toEqual([[1.2, 1.07, 0.6], [1.2, 1.07, 0.6]]);
      expect(warm(sb)).toEqual([[0.7, 0.6, 0.9], [0.7, 0.6, 0.9]]);
      expect((ground(sb)?.["uBedTint"] as Vector3).toArray()).toEqual([0.5, 0.5, 0.7]);
      expect(a.sky?.dome.geometry.getAttribute("color").array.slice(-3)).not.toEqual(b.sky?.dome.geometry.getAttribute("color").array.slice(-3));
      a.dispose();
      b.dispose();
    });
  }
});

describe("las fichas de NPC son válidas contra los personajes de DEFAULT_LOOK (y de cada look del catálogo)", () => {
  test("cuerpo, remera, sombrero, cuello y tokens de pantalón, piel y pelo de cada NPC de campesino y de Galeano", () => {
    const galeanoLooks = (galeano["npcs.json"] as { id: string; apariencia: unknown }[]).flatMap((n) => {
      const r = parseApariencia(n.apariencia);
      return r.ok ? [[n.id, r.look] as const] : [];
    });
    const all = [...Object.entries(contentLooks()), ...galeanoLooks];
    expect(galeanoLooks.length).toBeGreaterThanOrEqual(3);
    expect(all.length).toBeGreaterThan(5);
    for (const look of Object.values(WORLD_LOOKS)) {
      const c = look.characters;
      for (const [id, l] of all) {
        expect(c.bodies, `${look.id} ${id}`).toContain(l.body);
        expect(c.shirts, `${look.id} ${id}`).toContain(l.shirt);
        if (l.hat) expect(c.hats, `${look.id} ${id}`).toContain(l.hat);
        if (l.scarf) expect(c.scarves, `${look.id} ${id}`).toContain(l.scarf);
        for (const t of [l.pants, l.skin, l.hair]) expect(look.palette[t], `${look.id} ${id} ${t}`).toBeDefined();
      }
    }
  });
});
