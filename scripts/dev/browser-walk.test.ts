// M6.4 T8: the pure parts of the browser walk (D-815). The walk itself is on demand and outside `verify`; here
// the pixel criterion, the Chromium search (never installs) and the operator condition are pinned: the browser
// is always closed (the close lives in a `finally`).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { LOAD_MARKS, THIRD_PERSON } from "@lg/core";
import { MINIMAP_NPC_RED, minimapColors, WORLD_LOOKS } from "@lg/art";
import {
  AC51_CROWN_GATE_FROM, AC51_GRASS_POSES, AC51_TREE_PITCH, AC51_TREE_ZOOMS, findChromium, isMinimapRed, isNonUniform, MAX_DOMINANT_SHARE, MIN_DISTINCT_COLORS,
  MINIMAP_SIDE_PX, minimapSideFor,
  redClusters, WORLD_CANVAS, WORLD_FIRST_FRAME_MARK,
} from "./browser-walk.ts";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const fakeCache = (builds: readonly string[]): string => {
  const cache = mkdtempSync(join(tmpdir(), "pw-cache-"));
  dirs.push(cache);
  for (const b of builds) {
    const exe = join(cache, b, "chrome-win64/chrome.exe");
    mkdirSync(dirname(exe), { recursive: true });
    writeFileSync(exe, "");
  }
  return cache;
};

describe("isNonUniform (AC12/AC17)", () => {
  test("pasa con colores de sobra y sin dominante", () => {
    expect(isNonUniform({ distinct: MIN_DISTINCT_COLORS, dominantShare: MAX_DOMINANT_SHARE })).toBe(true);
  });
  test("un mapa vacio (un solo color) o con pocos colores no pasa", () => {
    expect(isNonUniform({ distinct: 1, dominantShare: 1 })).toBe(false);
    expect(isNonUniform({ distinct: MIN_DISTINCT_COLORS - 1, dominantShare: 0.3 })).toBe(false);
  });
  test("un color que cubre mas del tope no pasa", () => {
    expect(isNonUniform({ distinct: 40, dominantShare: MAX_DOMINANT_SHARE + 0.01 })).toBe(false);
  });
});

describe("findChromium", () => {
  test("elige el chromium-* mas nuevo, no el headless_shell", () => {
    const cache = fakeCache(["chromium-1208", "chromium-1248", "chromium_headless_shell-1300", "chromium-1217"]);
    const exe = findChromium({ PLAYWRIGHT_BROWSERS_PATH: cache }, "win32");
    expect(exe).toBe(join(cache, "chromium-1248", "chrome-win64/chrome.exe"));
  });
  test("sin cache o sin build devuelve null (el script avisa y no instala nada)", () => {
    expect(findChromium({ PLAYWRIGHT_BROWSERS_PATH: join(tmpdir(), "no-existe-pw") }, "win32")).toBeNull();
    expect(findChromium({ PLAYWRIGHT_BROWSERS_PATH: fakeCache([]) }, "win32")).toBeNull();
  });
  test("LG_CHROMIUM manda; si no existe devuelve null en vez de caer a otro", () => {
    const cache = fakeCache(["chromium-1248"]);
    expect(findChromium({ LG_CHROMIUM: join(tmpdir(), "no-existe.exe"), PLAYWRIGHT_BROWSERS_PATH: cache }, "win32")).toBeNull();
  });
});

// Recorded change (open-world-3d T2(f), D-833): the Chromium launch moved from browser-walk.ts to the shared
// launcher gl-mode.ts (used by the walk and the probe). The old assertion read `chromium.launch(` in browser-walk.ts;
// now it is read in gl-mode.ts, and browser-walk.ts has to open the browser only through `withGlBrowser`.
describe("condicion del operador (D-815): el navegador siempre se cierra", () => {
  const src = readFileSync(new URL("./browser-walk.ts", import.meta.url), "utf8");
  const launcher = readFileSync(new URL("./gl-mode.ts", import.meta.url), "utf8");
  test("el lanzamiento esta en un try cuyo finally cierra context y browser (gl-mode.ts)", () => {
    const run = launcher.indexOf("export async function withGlBrowser");
    const launch = launcher.indexOf("launchOnce(exe, o)", run);
    const fin = launcher.indexOf("} finally {", launch);
    expect(run).toBeGreaterThan(0);
    expect(launch).toBeGreaterThan(run);
    expect(fin).toBeGreaterThan(launch);
    expect(launcher.slice(fin, fin + 200)).toContain("closeBrowser(context, browser)");
    expect(launcher.match(/chromium\.launch\(/g)).toHaveLength(1);
  });
  test("la caminata abre el navegador solo por withGlBrowser", () => {
    expect(src).not.toContain("chromium.launch(");
    expect(src).toContain("withGlBrowser(");
  });
  test("existe la falla deliberada para que QA compruebe que no queda chromium vivo", () => {
    expect(src).toContain("--fail-on-purpose");
    expect(launcher).toContain("failOnPurpose");
  });
});

describe("AC51 (open-world-3d T8): las poses de las capturas de defectos son las del mockup", () => {
  test("pasto a 30, 45 y 57°; copas de t 0,65 a 1 con la inclinación por defecto de la tercera persona", () => {
    expect(AC51_GRASS_POSES.map((p) => p[2])).toEqual([30, 45, 57]);
    expect([...AC51_TREE_ZOOMS]).toEqual([0.65, 0.72, 0.8, 0.9, 1]);
    expect(AC51_TREE_PITCH).toBe(THIRD_PERSON.defaultPitchDeg);
  });
  test("D-844: las copas cuentan desde t 0,8; 0,65 y 0,72 se miden sin gate (K-1)", () => {
    expect(AC51_CROWN_GATE_FROM).toBe(0.8);
    expect(AC51_TREE_ZOOMS.filter((t) => t < AC51_CROWN_GATE_FROM)).toEqual([0.65, 0.72]);
  });
});

describe("AC57 (open-world-3d T9): puntos rojos del minimapa en una captura", () => {
  const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  /** A 40x20 capture with the look's ground and 4x4 squares of red at the given xs. */
  const img = (xs: readonly number[]): { width: number; height: number; data: Uint8Array } => {
    const [w, h] = [40, 20];
    const data = new Uint8Array(w * h * 4);
    const ground = hex(minimapColors(WORLD_LOOKS.pradera).ground);
    const red = hex(MINIMAP_NPC_RED);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const on = xs.some((x0) => x >= x0 && x < x0 + 4 && y >= 8 && y < 12);
      data.set([...(on ? red : ground), 255], (y * w + x) * 4);
    }
    return { width: w, height: h, data };
  };

  test("cuenta cada punto una vez; el suelo, el camino, el agua y la tinta no son rojos", () => {
    expect([0, 1, 2, 3].map((n) => redClusters(img([2, 12, 22, 32].slice(0, n))))).toEqual([0, 1, 2, 3]);
    expect(isMinimapRed(...hex(MINIMAP_NPC_RED))).toBe(true);
    for (const look of Object.values(WORLD_LOOKS)) {
      const c = minimapColors(look);
      for (const other of [c.ground, c.road, c.water, c.ring, c.player]) expect(isMinimapRed(...hex(other)), other).toBe(false);
    }
  });

  test("dos puntos pegados son uno (el conteo no inventa); motas de borde no cuentan", () => {
    expect(redClusters(img([10, 14]))).toBe(1);
    expect(redClusters(img([10]), 17)).toBe(0);
  });

  test("el canvas del mundo es el de la superficie del juego, no el primero del DOM (el minimapa también es un canvas)", () => {
    expect(WORLD_CANVAS).toBe("[data-lg-world] canvas");
  });
});

describe("T10: la caminata espera el primer cuadro compilado antes de capturar", () => {
  test("la marca que espera es la de @lg/core", () => {
    expect(WORLD_FIRST_FRAME_MARK).toBe(LOAD_MARKS.worldFirstFrame);
  });
});

describe("AC55: el lado del minimapa sigue el tamaño de texto (va en rem)", () => {
  test("160 y 112 px con texto al 100 %; 200 y 140 al 125 % por defecto", () => {
    expect(minimapSideFor(MINIMAP_SIDE_PX.desktop, 16)).toBe(160);
    expect(minimapSideFor(MINIMAP_SIDE_PX.desktop, 20)).toBe(200);
    expect(minimapSideFor(MINIMAP_SIDE_PX.phone, 20)).toBe(140);
  });
});
