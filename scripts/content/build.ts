// validate:content / build:content (04 F1.2, 03 §6.1, D-159): lee content/, valida con @lg/content-schema
// y escribe JSON en apps/web/public/content/ (cliente, sin prompts) y apps/server/generated/content/ (todo).
// Ambas salidas están en .gitignore. Con un error no escribe nada y sale con 1.
//
// Uso: node scripts/content/build.ts [--root <dir>] [--mode dev|fv|release]
// (verify corre dev: los borradores y las fichas sin verificar se ven, marcados; 03 §8.3).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compilarContenido, compilarIncremental, compilarManifiesto, formatearHallazgo, necesitaRegistro } from "@lg/content-schema";
import type { ArchivoFuente, Hallazgo, Modo, Resultado } from "@lg/content-schema";
import { chequearGrounding } from "./grounding.ts";

export const SALIDA_CLIENTE = "apps/web/public/content";
export const SALIDA_SERVIDOR = "apps/server/generated/content";

const aPosix = (p: string): string => p.split(sep).join("/");

/** content/universes/<id>/ de un universo namespaceado (S1/D-804). */
export const dirUniverso = (root: string, universe: string): string => join(root, "content", "universes", universe);

/**
 * Todos los archivos de un universo con su ruta CANÓNICA `content/<subpath>`.
 * Sin `universe`: lee la campesino legacy (`<root>/content/`), tal cual hoy (D-805, camino por defecto verbatim).
 * Con `universe`: lee `<root>/content/universes/<id>/` y normaliza cada ruta a `content/<subpath>`, así los 23
 * regexes de RUTAS en conjunto.ts matchean sin cambios (D-804: el lever es el reader, no el clasificador).
 */
export const leerContenido = (root: string, universe?: string): ArchivoFuente[] => {
  const base = universe ? dirUniverso(root, universe) : join(root, "content");
  const canonica = universe
    ? (p: string): string => aPosix(join("content", relative(base, p)))
    : (p: string): string => aPosix(relative(root, p));
  // El lector legacy (sin universo) NO desciende a content/universes/: esos árboles son otros universos y
  // sus rutas no son canónicas de la campesino, así que colarlos rompería la compilación (AC1/C-B).
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
  // open-world-3d T3: un universo se lee junto con el registro global de assets y créditos (sus dioramas usan los
  // mismos modelos que la campesino); antes solo `construir` los sumaba y quien leía el universo directo no los tenía.
  return universe ? conRegistroGlobal(root, out) : out;
};

/**
 * Archivos servidos en apps/web/public que exigen registro de licencia (models, textures, audio, sprites; 03 §6.4.2),
 * con su ruta desde root. El contenido generado (public/content/) no entra.
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
 * El registro de licencias y los créditos son GLOBALES: los archivos servidos en apps/web/public son de todos los
 * universos. Un universo namespaceado sin registro propio compila contra los de `content/` (open-world-3d T2), así
 * sus `modelo/*` y los archivos servidos se cruzan con el mismo registro que la campesino.
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

/**
 * Escribe las dos salidas desde cero (borra lo viejo para no dejar JSON huérfano). Solo se llama sin errores.
 * Sin `universe`: campesino → `apps/.../content/` (verbatim, lo que lee el loader con universeId unset, D-806).
 * Con `universe`: → `apps/.../content/<id>/`, el namespace que resuelve el loader para ese universeId.
 */
const escribirSalida = (root: string, r: Resultado, modo: Modo, universe?: string): void => {
  if (!r.salida) throw new Error("escribirSalida sin salida: hubo errores");
  const ids = Object.fromEntries([...r.conjunto.idsPorArchivo].map(([archivo, lista]) => [archivo, lista]));
  for (const [dir, archivos] of [[SALIDA_CLIENTE, r.salida.cliente], [SALIDA_SERVIDOR, r.salida.servidor]] as const) {
    const abs = universe ? join(root, dir, universe) : join(root, dir);
    rmSync(abs, { recursive: true, force: true });
    mkdirSync(abs, { recursive: true });
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
  /** Universo a compilar (D-804). Unset = campesino legacy (U-CAMPESINO), camino por defecto verbatim. */
  universe?: string | undefined;
  log: (s: string) => void;
}

const CABEZA_UNIVERSO = "content/manifiesto.yaml";

/**
 * Universo recién namespaceado (slice-1 M1): solo cabeza, sin dataset todavía. Valida el manifiesto y sale 0.
 * M3 SEAM: cuando el analizador EMITe el dataset Galeano, `contenido` deja de estar vacío y se corre el
 * compilador completo (OBLIGATORIOS, cruzados, lints, y el grounding gate de M4) — ver `construir`.
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

/** Compilación completa. Devuelve el código de salida. */
export const construir = ({ root, modo, universe, log }: Opciones): number => {
  const archivos = leerContenido(root, universe);
  // D-804/D-805: un universo con solo cabeza compila como scaffold (M1); con dataset, el compilador completo (M3).
  if (universe && archivos.every((a) => a.ruta === CABEZA_UNIVERSO)) return construirScaffold(universe, archivos, log);
  const r = compilarContenido(archivos, modo, leerPublicos(root));
  imprimir(r.hallazgos, log);
  const avisos = r.hallazgos.length - r.errores.length;
  if (!r.salida) {
    log(`validate:content: ${r.errores.length} error(es), ${avisos} aviso(s); no se escribió nada`);
    return 1;
  }
  // book-mode slice-1 M4 (D-807): fact-grounding gate, SCOPEADO a universos generados — solo cuando hay `--universe`.
  // La campesino sin flag NUNCA pasa por acá (sus saberes no llevan clasificacion y no deben re-clasificarse ni fallar).
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
 * Compilador incremental para la recarga en caliente de FD0: guarda el último contenido bueno; `actualizar`
 * recibe las rutas cambiadas (relativas a root), devuelve ids tocados y errores, y con error no escribe nada.
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
  // Acepta `--universe=U-GALEANO` y `--universe U-GALEANO`; unset = campesino legacy (D-806).
  const igual = argv.find((a) => a.startsWith("--universe="))?.slice("--universe=".length);
  const universe = igual ?? valor("--universe");
  return { root: resolve(valor("--root") ?? "."), modo, universe };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { root, modo, universe } = leerArgs(process.argv.slice(2));
  process.exitCode = construir({ root, modo, universe, log: (s) => console.log(s) });
}
