// EMIT stage — the ONLY real stage of slice-1 and the only one tied to @lg/content-schema (T2.3).
//
// Takes the intermediate (organized by contract field) and produces the universe's YAML files in their
// CANONICAL SUBPATHS. For each item:
//   1. validates it against the SAME zod schema the compiler uses (conjunto.ts) — AC5;
//   2. does a round-trip (stringify → parse → re-validate) to GUARANTEE that the YAML on disk validates, not just
//      the in-memory object;
//   3. if anything fails to validate, EMIT writes NOTHING (like build.ts: an error leaves the tree intact).
// Only with everything valid does it write one file per item, named by its id for the "one per file" types
// (so the complete M3 compiler passes the id↔file name check).
//
// Layout (S1/D-804): files go under `<outDir>` = content/universes/<id>/, at the canonical subpath WITHOUT the
// `content/` prefix (build.ts's reader re-adds `content/` when normalizing, so the 23 RUTAS regexes match).
//
// M3 SEAM: the slice-1 intermediate is a small sample (it proves one file per field). The complete Galeano
// intermediate (R1 Potosí) comes in M3 and EMIT writes it without changes here: EMIT already is the contract.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { z } from "zod";
import { parse, stringify } from "yaml";
import {
  ArchivoGlosario, ArchivoPresentaciones, ArchivoLugares, Diorama, FichaConversacion, Mision, Npc, Saber, Universo,
} from "@lg/content-schema";
import type { Intermedio } from "../intermediate.ts";

/** A file ready to write: its subpath (relative to outDir) and the validated value to serialize. */
export interface ArchivoEmitido {
  subpath: string;
  valor: unknown;
  /** Plain text files (prompts/*.txt): written as is, without going through YAML. */
  texto?: string;
}

export interface ResultadoEmit {
  archivos: ArchivoEmitido[];
  errores: string[];
}

/** Emission modes: a single file (singleton/composite file) or one per item named by its id. */
type Emisor =
  | { clave: keyof Intermedio; modo: "archivo"; subpath: string; schema: z.ZodType }
  | { clave: keyof Intermedio; modo: "porId"; dir: string; schema: z.ZodType };

/**
 * EMIT's contract: which intermediate field goes to which canonical subpath and with which schema it is validated.
 * The order is that of the reconciliation contract. `manifiesto` is the head of the universe (D-804).
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
 * Validates `valor` against `schema` and, if it passes, guarantees its YAML round-trips (it validates on disk too).
 * Returns the validated value or accumulates errors prefixed with the subpath.
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
 * Plans (pure, no fs) the files to emit from the intermediate, validating each one. It writes nothing:
 * so validity and "one file per field" can be tested without touching disk. An absent field is skipped.
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
    // porId: an array of items; each one to <dir>/<id>.yaml.
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

/** Name of a prompt: the same that conjunto.ts's `nombreBase` takes from content/prompts/<name>.txt. */
const NOMBRE_PROMPT = /^[a-z0-9][a-z0-9-]*$/;

/** `prompts`: { name: text } → prompts/<name>.txt (the universe brings its own `npc-base`, without inheriting the farmer universe's). */
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
 * Real EMIT: plans + validates; if there are no errors, writes each file under `outDir` and returns the written
 * paths. With any error it writes NOTHING (leaves the universe intact, like build.ts).
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
