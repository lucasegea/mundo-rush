// Content compiler: pure (text → data + findings). scripts/content/build.ts does the IO.
import { chequearAssets } from "./assets.ts";
import { chequearDioramas } from "./dioramas.ts";
import { buscarRetirados } from "./retirados.ts";
import { agregarArchivo, chequearDuplicados, conjuntoVacio } from "./conjunto.ts";
import type { Conjunto } from "./conjunto.ts";
import { extraerLineas } from "./lineas.ts";
import { lintBloqueos, lintCifras, lintLongitud, lintLongitudLumi } from "./lints.ts";
import { chequearCatalogoLumi, chequearNiveles, chequearRed, chequearReferencias } from "./referencias.ts";
import type { ArchivoFuente, Hallazgo, Modo } from "./tipos.ts";
import { vistaCliente, vistaServidor } from "./vistas.ts";
import type { Salida } from "./vistas.ts";

export interface Resultado {
  hallazgos: Hallazgo[];
  errores: Hallazgo[];
  conjunto: Conjunto;
  /** null if there were errors: nothing is written (04 F1.2 A9). */
  salida: { cliente: Salida; servidor: Salida } | null;
}

/** Files that must exist so the rest of the checks measure something (fails on 0 measured). */
const OBLIGATORIOS = [
  "content/world/places.yaml",
  "content/skills/skill-tree.yaml",
  "content/companion/lumi.es-AR.yaml",
  "content/retired-ids.yaml",
  "content/lint-allowlist.yaml",
  "content/safety/topics.global.yaml",
  "content/safety/containment.es-AR.yaml",
  "content/red/presentaciones.yaml",
];

/**
 * `publicos`: files served in apps/web/public (paths from the repo root), to cross-check them against the license
 * registry (plan estetica-c M2). Without the list only the cross-checks against disk are skipped.
 */
export const compilarContenido = (archivos: readonly ArchivoFuente[], modo: Modo = "dev", publicos?: readonly string[]): Resultado => {
  const h: Hallazgo[] = [];
  const c = conjuntoVacio();
  const ordenados = [...archivos].sort((a, b) => a.ruta.localeCompare(b.ruta));
  for (const f of ordenados) agregarArchivo(c, f, h);
  for (const ruta of OBLIGATORIOS) {
    if (!archivos.some((a) => a.ruta === ruta)) h.push({ nivel: "error", archivo: ruta, clave: "", regla: "archivo", mensaje: "falta un archivo obligatorio del contenido" });
  }
  if (c.bloqueos.length === 0) h.push({ nivel: "error", archivo: "content/safety/blocklists/", clave: "", regla: "archivo", mensaje: "no hay listas de bloqueo: los lints de seguridad no medirían nada" });
  if (c.niveles.length === 0) h.push({ nivel: "error", archivo: "content/level-cards/", clave: "", regla: "archivo", mensaje: "no hay tarjetas de nivel: el lint de longitud no mediría nada" });

  chequearDuplicados(c, h);
  chequearReferencias(c, h);
  chequearRed(c, h);
  chequearCatalogoLumi(c, h);
  chequearNiveles(c, h);
  chequearAssets(c, h, publicos);
  chequearDioramas(c, h);

  const lineas = extraerLineas(c);
  lintBloqueos(c, lineas, h);
  lintCifras(lineas, h);
  lintLongitud(c, lineas, h);
  lintLongitudLumi(lineas, h);
  if (c.retirados) h.push(...buscarRetirados(c.retirados.data.filas, ordenados));

  const errores = h.filter((x) => x.nivel === "error");
  return {
    hallazgos: h,
    errores,
    conjunto: c,
    salida: errores.length > 0 ? null : { cliente: vistaCliente(c, modo), servidor: vistaServidor(c, modo) },
  };
};

/**
 * Validates ONLY the head of a universe (content/universes/<id>/manifiesto.yaml), without the checks of the full
 * content (OBLIGATORIOS, cross-checks, lints). book-mode slice-1 (D-804): a newly namespaced universe has
 * a head but no dataset yet; the build exits 0 with this while `contenido` is empty.
 * M3 SEAM: once the analyzer EMITs the dataset, the build runs the full `compilarContenido`, not this.
 */
export const compilarManifiesto = (archivo: ArchivoFuente): { universo: Conjunto["universo"]; errores: Hallazgo[] } => {
  const c = conjuntoVacio();
  const h: Hallazgo[] = [];
  agregarArchivo(c, archivo, h);
  return { universo: c.universo, errores: h.filter((x) => x.nivel === "error") };
};

export interface ResultadoIncremental extends Resultado {
  /** Ids defined by the changed files, before and after the change (for the FD0 reload). */
  tocados: string[];
  archivos: ArchivoFuente[];
}

/**
 * Incremental compilation (04 F1.2, FD0): applies the changes (text null = deleted file) on top of the base,
 * revalidates everything (the cross-checks are not local) and returns the touched ids. With errors, output = null.
 */
export const compilarIncremental = (
  base: readonly ArchivoFuente[],
  cambios: readonly { ruta: string; texto: string | null }[],
  modo: Modo = "dev",
  publicos?: readonly string[],
): ResultadoIncremental => {
  const mapa = new Map(base.map((a) => [a.ruta, a.texto]));
  const antes = compilarSoloIds(base.filter((a) => cambios.some((ch) => ch.ruta === a.ruta)));
  for (const ch of cambios) {
    if (ch.texto === null) mapa.delete(ch.ruta);
    else mapa.set(ch.ruta, ch.texto);
  }
  const archivos = [...mapa].map(([ruta, texto]) => ({ ruta, texto }));
  const r = compilarContenido(archivos, modo, publicos);
  const despues = idsDe(r.conjunto, cambios.map((ch) => ch.ruta));
  return { ...r, tocados: [...new Set([...antes, ...despues])].sort(), archivos };
};

/** Ids that those files define, plus the scenes of their missions (the FD0 reload reloads per scene). */
const idsDe = (c: Conjunto, rutas: readonly string[]): string[] => [
  ...rutas.flatMap((r) => c.idsPorArchivo.get(r) ?? []),
  ...c.misiones.filter((m) => rutas.includes(m.archivo)).flatMap((m) => m.data.escenas.map((e) => e.escena_id)),
];

/** Ids that a group of files defines, without cross-checks. */
const compilarSoloIds = (archivos: readonly ArchivoFuente[]): string[] => {
  const c = conjuntoVacio();
  for (const f of archivos) agregarArchivo(c, f, []);
  return idsDe(c, archivos.map((a) => a.ruta));
};
