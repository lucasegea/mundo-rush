// Etapa EMIT — la ÚNICA etapa real de slice-1 y la única atada a @lg/content-schema (T2.3).
//
// Toma el intermedio (organizado por campo del contrato) y produce los archivos YAML del universo en sus
// SUBPATHS CANÓNICOS. Por cada ítem:
//   1. lo valida contra el MISMO esquema zod que usa el compilador (conjunto.ts) — AC5;
//   2. hace un round-trip (stringify → parse → re-valida) para GARANTIZAR que el YAML en disco valida, no solo
//      el objeto en memoria;
//   3. si algo no valida, EMIT no escribe NADA (igual que build.ts: un error deja el árbol intacto).
// Recién con todo válido escribe un archivo por ítem, nombrado por su id para los tipos de "uno por archivo"
// (así el compilador completo de M3 pasa el chequeo id↔nombre de archivo).
//
// Layout (S1/D-804): los archivos van bajo `<outDir>` = content/universes/<id>/, en el subpath canónico SIN el
// prefijo `content/` (el reader de build.ts reañade `content/` al normalizar, así los 23 regexes de RUTAS matchean).
//
// M3 SEAM: el intermedio de slice-1 es una muestra chica (prueba un archivo por campo). El intermedio Galeano
// completo (R1 Potosí) entra en M3 y EMIT lo escribe sin cambios acá: EMIT ya es el contrato.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { z } from "zod";
import { parse, stringify } from "yaml";
import {
  ArchivoGlosario, ArchivoPresentaciones, ArchivoLugares, Diorama, FichaConversacion, Mision, Npc, Saber, Universo,
} from "@lg/content-schema";
import type { Intermedio } from "../intermediate.ts";

/** Un archivo listo para escribir: su subpath (relativo a outDir) y el valor validado que va serializado. */
export interface ArchivoEmitido {
  subpath: string;
  valor: unknown;
  /** Archivos de texto plano (prompts/*.txt): se escriben tal cual, sin pasar por YAML. */
  texto?: string;
}

export interface ResultadoEmit {
  archivos: ArchivoEmitido[];
  errores: string[];
}

/** Modos de emisión: un único archivo (singleton/archivo compuesto) o uno por ítem nombrado por su id. */
type Emisor =
  | { clave: keyof Intermedio; modo: "archivo"; subpath: string; schema: z.ZodType }
  | { clave: keyof Intermedio; modo: "porId"; dir: string; schema: z.ZodType };

/**
 * El contrato de EMIT: qué campo del intermedio va a qué subpath canónico y con qué esquema se valida.
 * El orden es el del contrato de la reconciliación. `manifiesto` es la cabeza del universo (D-804).
 */
const PLAN: Emisor[] = [
  { clave: "manifiesto", modo: "archivo", subpath: "manifiesto.yaml", schema: Universo },
  { clave: "mundo", modo: "archivo", subpath: "world/places.yaml", schema: ArchivoLugares },
  { clave: "dioramas", modo: "porId", dir: "dioramas", schema: Diorama },
  { clave: "npcs", modo: "porId", dir: "npcs", schema: Npc },
  { clave: "red", modo: "archivo", subpath: "red/presentaciones.yaml", schema: ArchivoPresentaciones },
  { clave: "missions", modo: "porId", dir: "missions", schema: Mision },
  { clave: "conversaciones", modo: "porId", dir: "conversaciones", schema: FichaConversacion },
  { clave: "saberes", modo: "porId", dir: "saberes", schema: Saber },
  { clave: "glossary", modo: "archivo", subpath: "glossary/en.es-AR.yaml", schema: ArchivoGlosario },
];

const formatearIssues = (subpath: string, issues: readonly z.core.$ZodIssue[]): string[] =>
  issues.map((i) => `${subpath}: ${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`);

/**
 * Valida `valor` contra `schema` y, si pasa, garantiza que su YAML round-trippea (en disco también valida).
 * Devuelve el valor validado o acumula errores con el subpath como prefijo.
 */
const validarYRoundTrip = (schema: z.ZodType, subpath: string, valor: unknown, errores: string[]): unknown | null => {
  const r = schema.safeParse(valor);
  if (!r.success) {
    errores.push(...formatearIssues(subpath, r.error.issues));
    return null;
  }
  const reParsed = parse(stringify(r.data));
  const r2 = schema.safeParse(reParsed);
  if (!r2.success) {
    errores.push(...formatearIssues(subpath, r2.error.issues).map((m) => `${m} (tras round-trip YAML)`));
    return null;
  }
  return r.data;
};

const idDe = (valor: unknown): string | null =>
  valor !== null && typeof valor === "object" && typeof (valor as { id?: unknown }).id === "string"
    ? (valor as { id: string }).id
    : null;

/**
 * Planifica (puro, sin fs) los archivos a emitir desde el intermedio, validando cada uno. No escribe nada:
 * así se puede testear la validez y el "un archivo por campo" sin tocar disco. Un campo ausente se saltea.
 */
export const planearEmit = (intermedio: Intermedio): ResultadoEmit => {
  const archivos: ArchivoEmitido[] = [];
  const errores: string[] = [];
  for (const em of PLAN) {
    const valor = intermedio[em.clave];
    if (valor === undefined) continue;
    if (em.modo === "archivo") {
      const data = validarYRoundTrip(em.schema, em.subpath, valor, errores);
      if (data !== null) archivos.push({ subpath: em.subpath, valor: data });
      continue;
    }
    // porId: un array de ítems; cada uno a <dir>/<id>.yaml.
    if (!Array.isArray(valor)) {
      errores.push(`${em.clave}: se esperaba una lista de ítems`);
      continue;
    }
    valor.forEach((item, i) => {
      const id = idDe(item);
      const subpath = id ? `${em.dir}/${id}.yaml` : `${em.dir}/[${i}]`;
      if (!id) {
        errores.push(`${em.clave}[${i}]: el ítem no tiene un id string (hace falta para nombrar el archivo)`);
        return;
      }
      const data = validarYRoundTrip(em.schema, subpath, item, errores);
      if (data !== null) archivos.push({ subpath, valor: data });
    });
  }
  planearPrompts(intermedio.prompts, archivos, errores);
  return { archivos, errores };
};

/** Nombre de un prompt: el mismo que `nombreBase` de conjunto.ts saca de content/prompts/<nombre>.txt. */
const NOMBRE_PROMPT = /^[a-z0-9][a-z0-9-]*$/;

/** `prompts`: { nombre: texto } → prompts/<nombre>.txt (el universo trae su propio `npc-base`, sin heredar el de la campesino). */
const planearPrompts = (valor: unknown, archivos: ArchivoEmitido[], errores: string[]): void => {
  if (valor === undefined) return;
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    errores.push("prompts: se esperaba un objeto { nombre: texto }");
    return;
  }
  for (const [nombre, texto] of Object.entries(valor)) {
    const subpath = `prompts/${nombre}.txt`;
    if (!NOMBRE_PROMPT.test(nombre)) errores.push(`${subpath}: nombre de prompt inválido (minúsculas, dígitos y guiones)`);
    else if (typeof texto !== "string" || texto.trim() === "") errores.push(`${subpath}: el texto tiene que ser un string no vacío`);
    else archivos.push({ subpath, valor: null, texto });
  }
};

export interface SalidaEmit {
  escritos: string[];
  errores: string[];
}

/**
 * EMIT real: planifica + valida; si no hay errores, escribe cada archivo bajo `outDir` y devuelve las rutas
 * escritas. Con cualquier error no escribe NADA (deja el universo intacto, como build.ts).
 */
export const emit = (intermedio: Intermedio, outDir: string): SalidaEmit => {
  const { archivos, errores } = planearEmit(intermedio);
  if (errores.length > 0) return { escritos: [], errores };
  const escritos: string[] = [];
  for (const a of archivos) {
    const destino = join(outDir, a.subpath);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, a.texto ?? stringify(a.valor));
    escritos.push(a.subpath);
  }
  return { escritos, errores: [] };
};
