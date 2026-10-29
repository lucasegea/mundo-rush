// open-world-3d T7b (LK2, D-838): ningún archivo de apps/web/src/world escribe un color literal. Los colores del mundo son
// del look (`WorldLook` de @lg/art, DEFAULT_LOOK y el catálogo WORLD_LOOKS) y world/ los recibe como parámetro; un hex
// en world/ es un valor de look escondido en el motor que un look de otro universo no podría cambiar. En 0034931 había 7
// (las luces y el fondo del horneado de impostores, el fondo del retrato y la gorra roja nombrada en dos comentarios);
// T7b los movió. Cuenta también los comentarios (un hex en un comentario se copia al código) y los rgb()/rgba() de los
// lienzos (el atlas de nubes también pasó al look). Modelado sobre control-bytes.test.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const WORLD = "apps/web/src/world";

/** Un color literal: #rgb, #rgba, #rrggbb o #rrggbbaa, 0xRRGGBB, o rgb()/rgba() con números. */
const COLOR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w])|\b0x[0-9a-fA-F]{6}\b|\brgba?\(\s*\d/g;

/** Los colores literales de un texto, con su línea. */
export const colorLiterals = (text: string): { line: number; hit: string }[] =>
  text.split("\n").flatMap((l, i) => [...l.matchAll(COLOR)].map((m) => ({ line: i + 1, hit: m[0] })));

const worldFiles = (): string[] => {
  const out: string[] = [];
  const go = (abs: string): void => {
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      if (statSync(p).isDirectory()) go(p);
      else if (/\.(ts|tsx|glsl)$/.test(name)) out.push(relative(ROOT, p).replace(/\\/g, "/"));
    }
  };
  if (existsSync(join(ROOT, WORLD))) go(join(ROOT, WORLD));
  return out;
};

describe("LK2 (D-838): apps/web/src/world no escribe colores literales", () => {
  test("el detector marca hex, 0xRRGGBB y rgba(), y deja pasar directivas GLSL, máscaras y plantillas", () => {
    expect(colorLiterals(`const a = "#f4ede2";`).map((h) => h.hit)).toEqual(["#f4ede2"]);
    expect(colorLiterals(`new HemisphereLight(0xcfe6ff, 0x85994f, 1.6)`).map((h) => h.hit)).toEqual(["0xcfe6ff", "0x85994f"]);
    expect(colorLiterals(`g.addColorStop(0, "rgba(255,255,255,0.9)")`).length).toBe(1);
    expect(colorLiterals(`// la gorra 0xd6342c`).length).toBe(1);
    expect(colorLiterals(`fill: "#FFF"`).length).toBe(1);
    expect(colorLiterals("#include <common>\n#define USE_MAP\n#ifdef USE_FOG\n#endif").length).toBe(0);
    expect(colorLiterals("const css = (n: number) => `#${n.toString(16)}`; x & 0xff; seed ^ 0x6d2b79f5;").length).toBe(0);
    expect(colorLiterals("const s = `&#160;`; ver #12").length).toBe(0);
  });

  test("ningún archivo de world/ tiene uno (los colores salen del look)", () => {
    const files = worldFiles();
    // world/ tiene más de 70 módulos; el marcador de zona existe (lección F1.1a: un recorrido vacío pasa por nada).
    expect(existsSync(join(ROOT, WORLD, "index.ts"))).toBe(true);
    expect(files.length).toBeGreaterThan(60);
    const hits = files.flatMap((f) => colorLiterals(readFileSync(join(ROOT, f), "utf8")).map((h) => `${f}:${h.line} ${h.hit}`));
    expect(hits).toEqual([]);
  });
});
