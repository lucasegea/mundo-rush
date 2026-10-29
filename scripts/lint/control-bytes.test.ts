// open-world-3d T7, fix 1 (QA, AC43 y A13/A14): tres regex de tests tenían un byte 0x08 (retroceso) donde iba `\b`,
// escrito por un reemplazo de Python con string no crudo; la regex nunca podía coincidir y el guardián no tenía dientes.
// Este test recorre los archivos de texto de apps/, packages/, scripts/ y tooling/ y rechaza todo byte de control C0
// salvo tab, LF y CR. Los binarios (.glb, .ktx2, .wasm, ...) quedan fuera por extensión.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ZONES = ["apps", "packages", "scripts", "tooling"];
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|jsonl|ya?ml|md|css|html|glsl|patch|txt|svg|snap)$|(^|\/)LICENSE$/;
// Cambio registrado (open-world-3d T7b): fuera también apps/web/public/content/, la salida de build:content (en
// .gitignore, no es fuente). Los tests de contenido la reescriben en paralelo y el recorrido la leía a medio borrar
// (ENOENT en habilidades.json, verify en rojo 1 de 4 corridas). T7b fix 1 (QA): lo mismo con apps/server/generated/
// (en .gitignore, salida generada que la suite reescribe en paralelo; ENOENT en generated/content/).
const SKIP = /(^|\/)(node_modules|dist|\.vitest|coverage)(\/|$)|^apps\/web\/public\/content(\/|$)|^apps\/server\/generated(\/|$)/;
const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

const textFiles = (): string[] => {
  const out: string[] = [];
  const go = (abs: string): void => {
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      const rel = relative(ROOT, p).replace(/\\/g, "/");
      if (SKIP.test(rel)) continue;
      if (statSync(p).isDirectory()) go(p);
      else if (TEXT.test(rel)) out.push(rel);
    }
  };
  for (const zone of ZONES) if (existsSync(join(ROOT, zone))) go(join(ROOT, zone));
  return out;
};

/** Offsets of C0 control bytes other than tab, LF and CR. */
const controlBytes = (bytes: Uint8Array): number[] => {
  const hits: number[] = [];
  bytes.forEach((b, i) => {
    if (b < 0x20 && !ALLOWED.has(b)) hits.push(i);
  });
  return hits;
};

describe("ningún archivo de texto lleva bytes de control C0 (salvo tab, LF, CR)", () => {
  test("el detector marca 0x08 y 0x00 y deja pasar tab, LF y CR", () => {
    expect(controlBytes(Buffer.from(String.raw`/\bfoo\b/` + "\t\r\n"))).toEqual([]);
    expect(controlBytes(Buffer.from([0x2f, 0x08, 0x66, 0x2f]))).toEqual([1]);
    expect(controlBytes(Buffer.from([0x00, 0x09, 0x0a, 0x0d, 0x1b]))).toEqual([0, 4]);
  });

  test("apps/, packages/, scripts/ y tooling/ están limpios", () => {
    const files = textFiles();
    expect(files.length).toBeGreaterThan(400);
    // Los tres tests que tenían el 0x08 están dentro del recorrido.
    for (const rel of ["scripts/assets/bake-trees.test.ts", "apps/web/test/open-world-characters.test.ts", "apps/web/test/estetica-c.test.ts"]) {
      expect(files, rel).toContain(rel);
    }
    const dirty = files
      .map((rel) => ({ rel, at: controlBytes(readFileSync(join(ROOT, rel))) }))
      .filter((f) => f.at.length > 0)
      .map((f) => `${f.rel} @ ${f.at.slice(0, 5).join(",")}`);
    expect(dirty).toEqual([]);
  });
});
