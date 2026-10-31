// validate:content / build:content (04 F1.2, 03 §6.1, D-159): reads content/, validates with @lg/content-schema
// and writes JSON to apps/web/public/content/ (client, no prompts) and apps/server/generated/content/ (everything).
// Both outputs are in .gitignore. On an error it writes nothing and exits with 1.
//
// Usage: node scripts/content/build.ts [--root <dir>] [--mode dev|fv|release]
// (verify runs dev: drafts and unverified cards are visible, marked; 03 §8.3).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compilarContenido, compilarIncremental, compilarManifiesto, formatearHallazgo, necesitaRegistro } from "@lg/content-schema";
import type { ArchivoFuente, Hallazgo, Modo, Resultado } from "@lg/content-schema";
import { chequearGrounding } from "./grounding.ts";

export const SALIDA_CLIENTE = "apps/web/public/content";
export const SALIDA_SERVIDOR = "apps/server/generated/content";

const aPosix = (p: string): string => p.split(sep).join("/");

/** content/universes/<id>/ of a namespaced universe (S1/D-804). */
export const dirUniverso = (root: string, universe: string): string => join(root, "content", "universes", universe);

/**
 * All files of a universe with their CANONICAL path `content/<subpath>`.
 * Without `universe`: reads the legacy farmer universe (`<root>/content/`), exactly as today (D-805, default path verbatim).
 * With `universe`: reads `<root>/content/universes/<id>/` and normalizes each path to `content/<subpath>`, so the 23
 * PATH regexes in conjunto.ts match unchanged (D-804: the lever is the reader, not the classifier).
 */
export const leerContenido = (root: string, universe?: string): ArchivoFuente[] => {
  const base = universe ? dirUniverso(root, universe) : join(root, "content");
  const canonica = universe
    ? (p: string): string => aPosix(join("content", relative(base, p)))
    : (p: string): string => aPosix(relative(root, p));
  // The legacy reader (no universe) does NOT descend into content/universes/: those trees are other universes and
  // their paths are not canonical for the farmer universe, so letting them in would break the compilation (AC1/C-B).
  const saltar = universe ? null : join(root, "content", "universes");
  const out: ArchivoFuente[] = [];
  const recorrer = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (p !== saltar) recorrer(p);
      } else out.push({ ruta: canonica(p), texto: readFileSync(p, "utf8") });
    }
  };
  recorrer(base);
  // open-world-3d T3: a universe is read together with the global assets and credits registry (its dioramas use the
  // same models as the farmer universe); before, only `construir` added them and whoever read the universe directly did not have them.
  return universe ? conRegistroGlobal(root, out) : out;
};

/**
 * Files served in apps/web/public that require a license record (models, textures, audio, sprites; 03 §6.4.2),
 * with their path from root. Generated content (public/content/) does not count.
 */
export const leerPublicos = (root: string): string[] => {
  const out: string[] = [];
  const recorrer = (dir: string): void => {
    let entradas;
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    for (const e of entradas) {
      const p = join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else out.push(aPosix(relative(root, p)));
    }
  };
  recorrer(join(root, "apps/web/public"));
  return out.filter(necesitaRegistro).sort();
};

/**
 * The license registry and the credits are GLOBAL: the files served in apps/web/public belong to all
 * universes. A namespaced universe without its own registry compiles against those of `content/` (open-world-3d T2), so
 * its `modelo/*` and the served files are cross-checked against the same registry as the farmer universe.
 */
const RUTAS_GLOBALES = ["content/assets-registry.yaml", "content/creditos.yaml"] as const;
const conRegistroGlobal = (root: string, archivos: readonly ArchivoFuente[]): ArchivoFuente[] => {
  const extra = RUTAS_GLOBALES.filter((ruta) => !archivos.some((a) => a.ruta === ruta)).flatMap((ruta) => {
    try {
      return [{ ruta, texto: readFileSync(join(root, ruta), "utf8") }];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  });
  return [...archivos, ...extra];
};

/** An output subfolder that belongs to a namespaced universe (`U-GALEANO`, …). */
export const DIR_UNIVERSO = /^U-[A-Z0-9-]+$/;

/**
 * Empties an output folder before writing it. A universe build owns its whole `<id>/` folder. The default (farmer)
 * build owns the root but NOT the `U-*` subfolders next to it: wiping them left a running universe without its map
 * (J-1, 2026-10-30).
 */
export const vaciarSalida = (abs: string, universe?: string): void => {
  if (universe) {
    rmSync(abs, { recursive: true, force: true });
  } else {
    mkdirSync(abs, { recursive: true });
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory() && DIR_UNIVERSO.test(e.name)) continue;
      rmSync(join(abs, e.name), { recursive: true, force: true });
    }
  }
  mkdirSync(abs, { recursive: true });
};

/**
 * Writes both outputs from scratch (deletes the old to leave no orphan JSON). Only called without errors.
 * Without `universe`: farmer universe → `apps/.../content/` (verbatim, what the loader reads with universeId unset, D-806).
 * With `universe`: → `apps/.../content/<id>/`, the namespace the loader resolves for that universeId.
 */
const escribirSalida = (root: string, r: Resultado, modo: Modo, universe?: string): void => {
  if (!r.salida) throw new Error("escribirSalida sin salida: hubo errores");
  const ids = Object.fromEntries([...r.conjunto.idsPorArchivo].map(([archivo, lista]) => [archivo, lista]));
  for (const [dir, archivos] of [[SALIDA_CLIENTE, r.salida.cliente], [SALIDA_SERVIDOR, r.salida.servidor]] as const) {
    const abs = universe ? join(root, dir, universe) : join(root, dir);
    vaciarSalida(abs, universe);
    for (const [nombre, data] of Object.entries(archivos)) writeFileSync(join(abs, nombre), `${JSON.stringify(data, null, 2)}\n`);
    const indice = dir === SALIDA_SERVIDOR ? { modo, ids } : { modo };
    writeFileSync(join(abs, "indice.json"), `${JSON.stringify(indice, null, 2)}\n`);
  }
};

const imprimir = (hallazgos: readonly Hallazgo[], log: (s: string) => void): void => {
  for (const x of hallazgos) log(formatearHallazgo(x));
};

export interface Opciones {
  root: string;
  modo: Modo;
  /** Universe to compile (D-804). Unset = legacy farmer universe (U-CAMPESINO), default path verbatim. */
  universe?: string | undefined;
  log: (s: string) => void;
}

const CABEZA_UNIVERSO = "content/manifiesto.yaml";

/**
 * Newly namespaced universe (slice-1 M1): head only, no dataset yet. Validates the manifest and exits 0.
 * M3 SEAM: when the analyzer EMITs the Galeano dataset, `contenido` stops being empty and the full
 * compiler runs (REQUIRED, cross-checked, lints, and M4's grounding gate) — see `construir`.
 */
const construirScaffold = (universe: string, archivos: readonly ArchivoFuente[], log: (s: string) => void): number => {
  const manifiesto = archivos.find((a) => a.ruta === CABEZA_UNIVERSO);
  if (!manifiesto) {
    log(`build:content: falta content/universes/${universe}/manifiesto.yaml (cabeza del universo)`);
    return 1;
  }
  const { universo, errores } = compilarManifiesto(manifiesto);
  imprimir(errores, log);
  if (!universo || errores.length > 0) {
    log(`build:content: manifiesto de ${universe} inválido (${errores.length} error(es)); no se escribió nada`);
    return 1;
  }
  log(`build:content OK (${universe}): universo "${universo.titulo}" — ${universo.libro_fuente}; sin dataset todavía (scaffold)`);
  return 0;
};

/** Full compilation. Returns the exit code. */
export const construir = ({ root, modo, universe, log }: Opciones): number => {
  const archivos = leerContenido(root, universe);
  // D-804/D-805: a head-only universe compiles as a scaffold (M1); with a dataset, the full compiler (M3).
  if (universe && archivos.every((a) => a.ruta === CABEZA_UNIVERSO)) return construirScaffold(universe, archivos, log);
  const r = compilarContenido(archivos, modo, leerPublicos(root));
  imprimir(r.hallazgos, log);
  const avisos = r.hallazgos.length - r.errores.length;
  if (!r.salida) {
    log(`validate:content: ${r.errores.length} error(es), ${avisos} aviso(s); no se escribió nada`);
    return 1;
  }
  // book-mode slice-1 M4 (D-807): fact-grounding gate, SCOPED to generated universes — only when there is `--universe`.
  // The farmer universe without the flag NEVER goes through here (its knowledge items carry no clasificacion and must not be re-classified or fail).
  if (universe) {
    const erroresGrounding = chequearGrounding(r.conjunto);
    if (erroresGrounding.length > 0) {
      imprimir(erroresGrounding, log);
      log(`validate:content: grounding gate — ${erroresGrounding.length} error(es) en ${universe}; no se escribió nada`);
      return 1;
    }
  }
  escribirSalida(root, r, modo, universe);
  const c = r.conjunto;
  log(`validate:content OK (${modo}): ${c.misiones.length} misiones, ${c.npcs.length} NPCs, ${c.saberes.length} saberes, ${c.plantillas.length} plantillas de Lumi, ${c.glosario.length} entradas de glosario, ${avisos} aviso(s)`);
  log(`  → ${SALIDA_CLIENTE}/ (${Object.keys(r.salida.cliente).length + 1} archivos) · ${SALIDA_SERVIDOR}/ (${Object.keys(r.salida.servidor).length + 1} archivos)`);
  return 0;
};

/**
 * Incremental compiler for FD0's hot reload: keeps the last good content; `actualizar`
 * receives the changed paths (relative to root), returns touched ids and errors, and on error writes nothing.
 */
export const crearCompiladorIncremental = (root: string, modo: Modo = "dev") => {
  let base = leerContenido(root);
  return {
    actualizar(rutas: readonly string[]): { tocados: string[]; errores: Hallazgo[]; escrito: boolean } {
      const cambios = rutas.map((ruta) => {
        try {
          return { ruta, texto: readFileSync(join(root, ruta), "utf8") };
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ENOENT") return { ruta, texto: null };
          throw e;
        }
      });
      const r = compilarIncremental(base, cambios, modo, leerPublicos(root));
      if (!r.salida) return { tocados: r.tocados, errores: r.errores, escrito: false };
      escribirSalida(root, r, modo);
      base = r.archivos;
      return { tocados: r.tocados, errores: [], escrito: true };
    },
  };
};

const leerArgs = (argv: readonly string[]): { root: string; modo: Modo; universe?: string | undefined } => {
  const valor = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const modo = valor("--mode") ?? "dev";
  if (modo !== "dev" && modo !== "fv" && modo !== "release") throw new Error(`--mode inválido: ${modo}`);
  // Accepts `--universe=U-GALEANO` and `--universe U-GALEANO`; unset = legacy farmer universe (D-806).
  const igual = argv.find((a) => a.startsWith("--universe="))?.slice("--universe=".length);
  const universe = igual ?? valor("--universe");
  return { root: resolve(valor("--root") ?? "."), modo, universe };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { root, modo, universe } = leerArgs(process.argv.slice(2));
  process.exitCode = construir({ root, modo, universe, log: (s) => console.log(s) });
}
