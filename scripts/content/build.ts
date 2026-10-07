// validate:content / build:content (04 F1.2, 03 §6.1, D-159): lee content/, valida con @lg/content-schema
// y escribe JSON en apps/web/public/content/ (cliente, sin prompts) y apps/server/generated/content/ (todo).
// Ambas salidas están en .gitignore. Con un error no escribe nada y sale con 1.
//
// Uso: node scripts/content/build.ts [--root <dir>] [--mode dev|fv|release]
// (verify corre dev: los borradores y las fichas sin verificar se ven, marcados; 03 §8.3).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compilarContenido, compilarIncremental, formatearHallazgo } from "@lg/content-schema";
import type { ArchivoFuente, Hallazgo, Modo, Resultado } from "@lg/content-schema";

export const SALIDA_CLIENTE = "apps/web/public/content";
export const SALIDA_SERVIDOR = "apps/server/generated/content";

const aPosix = (p: string): string => p.split(sep).join("/");

/** Todos los archivos de <root>/content con su ruta relativa a root (`content/missions/M0.1.yaml`). */
export const leerContenido = (root: string): ArchivoFuente[] => {
  const out: ArchivoFuente[] = [];
  const recorrer = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else out.push({ ruta: aPosix(relative(root, p)), texto: readFileSync(p, "utf8") });
    }
  };
  recorrer(join(root, "content"));
  return out;
};

/** Escribe las dos salidas desde cero (borra lo viejo para no dejar JSON huérfano). Solo se llama sin errores. */
const escribirSalida = (root: string, r: Resultado, modo: Modo): void => {
  if (!r.salida) throw new Error("escribirSalida sin salida: hubo errores");
  const ids = Object.fromEntries([...r.conjunto.idsPorArchivo].map(([archivo, lista]) => [archivo, lista]));
  for (const [dir, archivos] of [[SALIDA_CLIENTE, r.salida.cliente], [SALIDA_SERVIDOR, r.salida.servidor]] as const) {
    const abs = join(root, dir);
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
  log: (s: string) => void;
}

/** Compilación completa. Devuelve el código de salida. */
export const construir = ({ root, modo, log }: Opciones): number => {
  const r = compilarContenido(leerContenido(root), modo);
  imprimir(r.hallazgos, log);
  const avisos = r.hallazgos.length - r.errores.length;
  if (!r.salida) {
    log(`validate:content: ${r.errores.length} error(es), ${avisos} aviso(s); no se escribió nada`);
    return 1;
  }
  escribirSalida(root, r, modo);
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
      const r = compilarIncremental(base, cambios, modo);
      if (!r.salida) return { tocados: r.tocados, errores: r.errores, escrito: false };
      escribirSalida(root, r, modo);
      base = r.archivos;
      return { tocados: r.tocados, errores: [], escrito: true };
    },
  };
};

const leerArgs = (argv: readonly string[]): { root: string; modo: Modo } => {
  const valor = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const modo = valor("--mode") ?? "dev";
  if (modo !== "dev" && modo !== "fv" && modo !== "release") throw new Error(`--mode inválido: ${modo}`);
  return { root: resolve(valor("--root") ?? "."), modo };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { root, modo } = leerArgs(process.argv.slice(2));
  process.exitCode = construir({ root, modo, log: (s) => console.log(s) });
}
