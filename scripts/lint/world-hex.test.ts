// open-world-3d T7b (LK2, D-838): no file in apps/web/src/world writes a literal color. The world's colors belong to
// the look (`WorldLook` from @lg/art, DEFAULT_LOOK and the WORLD_LOOKS catalog) and world/ receives them as a parameter; a hex
// in world/ is a look value hidden in the engine that a look from another universe could not change. At 0034931 there were 7
// (the lights and background of the impostor bake, the portrait background and the red cap named in two comments);
// T7b moved them. It also counts comments (a hex in a comment gets copied into code) and the rgb()/rgba() of the
// canvases (the cloud atlas also moved to the look). Modeled on control-bytes.test.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const WORLD = "apps/web/src/world";

/** A literal color: #rgb, #rgba, #rrggbb or #rrggbbaa, 0xRRGGBB, or rgb()/rgba() with numbers. */
const COLOR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w])|\b0x[0-9a-fA-F]{6}\b|\brgba?\(\s*\d/g;

/** The literal colors of a text, with their line. */
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
    // world/ has more than 70 modules; the zone marker exists (F1.1a lesson: an empty walk passes for nothing).
    expect(existsSync(join(ROOT, WORLD, "index.ts"))).toBe(true);
    expect(files.length).toBeGreaterThan(60);
    const hits = files.flatMap((f) => colorLiterals(readFileSync(join(ROOT, f), "utf8")).map((h) => `${f}:${h.line} ${h.hit}`));
    expect(hits).toEqual([]);
  });
});
