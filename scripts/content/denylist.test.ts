// open-world-3d T2(c) (AC10, C9): nothing derived from other people's commercial games enters the repo. The operator's mood
// reference is only that: no extraction, ripping, reverse engineering or emulators. Walks the versioned files (and the
// new unignored ones, so a file planted without `git add` also fails) under apps, packages, scripts, content and
// tooling: neither the path nor the content (registry rows included: author, url_origen, notes) name the blacklist.
// This file and scripts/content/provenance.test.ts are left out by name.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DENY = /nintendo|pok[eé]mon|game ?freak|yuzu|ryujinx|\.nsp\b|\.xci\b|rom ?dump|extracted from/i;
const EXCLUIDOS = new Set(["scripts/content/denylist.test.ts", "scripts/content/provenance.test.ts"]);
const CARPETAS = ["apps", "packages", "scripts", "content", "tooling"];

const archivos = (): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...CARPETAS], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0").filter((p) => p !== "" && !EXCLUIDOS.has(p));

describe("AC10: lista negra de derivación", () => {
  const lista = archivos();

  test("recorre el árbol de verdad", () => {
    expect(lista.length).toBeGreaterThan(500);
    expect(lista).toContain("content/assets-registry.yaml");
  });

  test("ninguna ruta nombra la lista negra", () => {
    expect(lista.filter((p) => DENY.test(p))).toEqual([]);
  });

  test("ningún contenido nombra la lista negra (binarios leídos como latin1)", () => {
    const hits = lista.flatMap((p) => {
      let texto: string;
      try {
        texto = readFileSync(join(ROOT, p), "latin1");
      } catch (e) {
        // Deleted in the working tree and still in the index: there are no bytes to read.
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw e;
      }
      const m = DENY.exec(texto);
      return m ? [`${p}: "${m[0]}"`] : [];
    });
    expect(hits).toEqual([]);
  });
});
