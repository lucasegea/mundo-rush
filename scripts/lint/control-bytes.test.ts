// open-world-3d T7, fix 1 (QA, AC43 and A13/A14): three test regexes had a 0x08 byte (backspace) where `\b` belonged,
// written by a Python replacement with a non-raw string; the regex could never match and the guard had no teeth.
// This test walks the text files of apps/, packages/, scripts/ and tooling/ and rejects every C0 control byte
// except tab, LF and CR. Binaries (.glb, .ktx2, .wasm, ...) are left out by extension.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ZONES = ["apps", "packages", "scripts", "tooling"];
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|jsonl|ya?ml|md|css|html|glsl|patch|txt|svg|snap)$|(^|\/)LICENSE$/;
// Recorded change (open-world-3d T7b): apps/web/public/content/ is also out, the build:content output (in
// .gitignore, not source). The content tests rewrite it in parallel and the walk read it half-deleted
// (ENOENT on habilidades.json, verify red 1 run in 4). T7b fix 1 (QA): the same with apps/server/generated/
// (in .gitignore, generated output that the suite rewrites in parallel; ENOENT in generated/content/).
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
    // The three tests that had the 0x08 are inside the walk.
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
