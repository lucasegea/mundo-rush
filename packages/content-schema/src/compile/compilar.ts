// Compilador de contenido: puro (texto → datos + hallazgos). scripts/content/build.ts hace el IO.
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
  /** null si hubo errores: nada se escribe (04 F1.2 A9). */
  salida: { cliente: Salida; servidor: Salida } | null;
}

/** Archivos que tienen que existir para que el resto de los chequeos midan algo (falla en 0 medido). */
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

export const compilarContenido = (archivos: readonly ArchivoFuente[], modo: Modo = "dev"): Resultado => {
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

export interface ResultadoIncremental extends Resultado {
  /** Ids definidos por los archivos cambiados, antes y después del cambio (para la recarga de FD0). */
  tocados: string[];
  archivos: ArchivoFuente[];
}

/**
 * Compilación incremental (04 F1.2, FD0): aplica los cambios (texto null = archivo borrado) sobre la base,
 * revalida todo (los chequeos cruzados no son locales) y devuelve los ids tocados. Con errores, salida = null.
 */
export const compilarIncremental = (
  base: readonly ArchivoFuente[],
  cambios: readonly { ruta: string; texto: string | null }[],
  modo: Modo = "dev",
): ResultadoIncremental => {
  const mapa = new Map(base.map((a) => [a.ruta, a.texto]));
  const antes = compilarSoloIds(base.filter((a) => cambios.some((ch) => ch.ruta === a.ruta)));
  for (const ch of cambios) {
    if (ch.texto === null) mapa.delete(ch.ruta);
    else mapa.set(ch.ruta, ch.texto);
  }
  const archivos = [...mapa].map(([ruta, texto]) => ({ ruta, texto }));
  const r = compilarContenido(archivos, modo);
  const despues = idsDe(r.conjunto, cambios.map((ch) => ch.ruta));
  return { ...r, tocados: [...new Set([...antes, ...despues])].sort(), archivos };
};

/** Ids que definen esos archivos, más las escenas de sus misiones (la recarga de FD0 recarga por escena). */
const idsDe = (c: Conjunto, rutas: readonly string[]): string[] => [
  ...rutas.flatMap((r) => c.idsPorArchivo.get(r) ?? []),
  ...c.misiones.filter((m) => rutas.includes(m.archivo)).flatMap((m) => m.data.escenas.map((e) => e.escena_id)),
];

/** Ids que define un grupo de archivos, sin chequeos cruzados. */
const compilarSoloIds = (archivos: readonly ArchivoFuente[]): string[] => {
  const c = conjuntoVacio();
  for (const f of archivos) agregarArchivo(c, f, []);
  return idsDe(c, archivos.map((a) => a.ruta));
};
