// open-world-3d T2(c) (AC10, C9): nada derivado de juegos comerciales ajenos entra al repo. La referencia de ánimo del
// operador es solo eso: sin extracción, ripeo, ingeniería inversa ni emuladores. Recorre los archivos versionados (y los
// nuevos sin ignorar, para que un archivo plantado sin `git add` también falle) bajo apps, packages, scripts, content y
// tooling: ni la ruta ni el contenido (filas del registro incluidas: autor, url_origen, notas) nombran la lista negra.
// Este archivo y scripts/content/provenance.test.ts quedan fuera por nombre.
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
        // Borrado en el árbol de trabajo y todavía en el índice: no hay bytes que leer.
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw e;
      }
      const m = DENY.exec(texto);
      return m ? [`${p}: "${m[0]}"`] : [];
    });
    expect(hits).toEqual([]);
  });
});
