// M6.4 T8: lo puro de la caminata de navegador (D-815). La caminata en si es a pedido y fuera de `verify`; aca se
// fijan el criterio de pixeles, la busqueda de Chromium (nunca instala) y la condicion del operador: el navegador
// se cierra siempre (el cierre vive en un `finally`).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { findChromium, isNonUniform, MAX_DOMINANT_SHARE, MIN_DISTINCT_COLORS } from "./browser-walk.ts";

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

describe("condicion del operador (D-815): el navegador siempre se cierra", () => {
  const src = readFileSync(new URL("./browser-walk.ts", import.meta.url), "utf8");
  test("el lanzamiento esta en un try cuyo finally cierra context y browser", () => {
    const launch = src.indexOf("chromium.launch(");
    const fin = src.indexOf("} finally {", launch);
    expect(launch).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(launch);
    expect(src.slice(fin, fin + 200)).toContain("closeBrowser(context, browser)");
  });
  test("existe la falla deliberada para que QA compruebe que no queda chromium vivo", () => {
    expect(src).toContain("--fail-on-purpose");
  });
});
