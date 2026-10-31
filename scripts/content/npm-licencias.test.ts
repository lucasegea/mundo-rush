// open-world-3d T2(c) (AC9, D-831): npm licenses of apps/web's production closure, over the real lockfile, plus
// two fake lockfiles (a GPL package and an override with a non-matching hash) that fail naming the package.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";
import { cierreProduccion, problemasNpm, type Lock, type Override } from "./npm-licencias.ts";
import { leerArbol, sinFila } from "./provenance.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LOCK = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as Lock;
const OVERRIDES = (parse(readFileSync(join(ROOT, "content/npm-licence-overrides.yaml"), "utf8")) as { overrides: Record<string, Override> }).overrides;

/** sha256 of the package's first LICENSE* in node_modules. */
const hashLicencia = (clave: string): string | null => {
  for (const nombre of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "LICENCE"]) {
    const abs = join(ROOT, clave, nombre);
    if (existsSync(abs)) return createHash("sha256").update(readFileSync(abs)).digest("hex");
  }
  return null;
};

describe("AC9: licencias de npm del cliente", () => {
  test("el cierre real es el esperado: potpack, n8ao, which e isexe (ISC) y webgl-constants (override) adentro", () => {
    const cierre = cierreProduccion(LOCK);
    expect(cierre.length).toBeGreaterThan(50);
    for (const p of ["potpack", "n8ao", "which", "isexe", "webgl-constants", "three", "react"]) expect(cierre, p).toContain(`node_modules/${p}`);
    expect(LOCK.packages["node_modules/webgl-constants"]?.license).toBeUndefined();
  });

  test("todo el cierre real pasa (ISC por el lockfile, webgl-constants por su override)", () => {
    expect(problemasNpm(LOCK, OVERRIDES, hashLicencia)).toEqual([]);
  });

  test("un lockfile con un paquete GPL falla nombrándolo", () => {
    const lock: Lock = { packages: { ...LOCK.packages, "node_modules/potpack": { ...LOCK.packages["node_modules/potpack"], license: "GPL-3.0" } } };
    const p = problemasNpm(lock, OVERRIDES, hashLicencia);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("potpack@");
    expect(p[0]).toContain("GPL-3.0");
  });

  test("un override cuyo hash no coincide falla nombrando el paquete", () => {
    const malos = { ...OVERRIDES, "webgl-constants@1.1.1": { license: "MIT", license_file_sha256: "0".repeat(64) } };
    const p = problemasNpm(LOCK, malos, hashLicencia);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("webgl-constants@1.1.1");
  });

  test("content/code-registry.yaml lista cada archivo de tooling/vendor/ y apps/web/public/decoders/", () => {
    const arbol = leerArbol(ROOT);
    expect(arbol.archivos.codigo.length).toBeGreaterThanOrEqual(1);
    expect(sinFila(arbol).filter((x) => x.includes("code-registry"))).toEqual([]);
  });
});
