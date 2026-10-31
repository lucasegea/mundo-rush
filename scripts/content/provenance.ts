// Provenance of every third-party byte (open-world-3d T2(c), D-831, AC8). Recomputes the sha256 of every served file
// (apps/web/public/{models,textures,audio,sprites,decoders}) and vendored one (tooling/vendor/) and cross-checks it with its row:
// content/assets-registry.yaml for assets, content/code-registry.yaml for code. Reads the raw YAML (without the zod
// schema) on purpose: each check is independent, so a bad row lights up ONLY the check it concerns and does not
// bring down the parsing of the others. The schema (packages/content-schema) validates the same at compile time; this proves it on disk.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "yaml";
import { LICENCIAS_CON_ATRIBUCION, licenciaPermitida, pideArchivoLicencia } from "@lg/content-schema";

/** Folders whose files go in the assets registry. */
export const CARPETAS_ASSETS = ["apps/web/public/models", "apps/web/public/textures", "apps/web/public/audio", "apps/web/public/sprites"] as const;
/** Folders whose files go in the code registry. */
export const CARPETAS_CODIGO = ["apps/web/public/decoders", "tooling/vendor"] as const;

export const RUTA_ASSETS = "content/assets-registry.yaml";
export const RUTA_CODIGO = "content/code-registry.yaml";
export const RUTA_CREDITOS = "content/creditos.yaml";

/** A raw row (asset or code), with the fields the checks look at. */
export interface Fila {
  registro: "assets" | "codigo";
  id: string;
  archivo: string;
  licencia: string;
  pack?: string | undefined;
  sha256?: string | undefined;
  procedencia?: string | undefined;
  archivo_licencia?: string | undefined;
  atribucion_requerida?: boolean | undefined;
  /** Edited code only: its `<file>.patch` (open-world-3d T7). */
  parche?: string | undefined;
}

export interface Arbol {
  root: string;
  /** Files on disk under the assets and code folders (posix paths from root), sorted. */
  archivos: { assets: string[]; codigo: string[] };
  filas: Fila[];
  /** Packs with an entry in content/creditos.yaml. */
  creditos: Set<string>;
}

const aPosix = (p: string): string => p.split(sep).join("/");

const listar = (root: string, dir: string): string[] => {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const recorrer = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else out.push(aPosix(relative(root, p)));
    }
  };
  recorrer(abs);
  return out;
};

const yaml = (root: string, ruta: string): Record<string, unknown> => {
  const abs = join(root, ruta);
  return existsSync(abs) ? ((parse(readFileSync(abs, "utf8")) ?? {}) as Record<string, unknown>) : {};
};

const filas = (registro: Fila["registro"], lista: unknown): Fila[] =>
  (Array.isArray(lista) ? lista : []).map((r: Record<string, unknown>) => ({
    registro,
    id: String(r.id ?? ""),
    archivo: String(r.archivo ?? ""),
    licencia: String(r.licencia ?? ""),
    pack: typeof r.pack === "string" ? r.pack : undefined,
    sha256: typeof r.sha256 === "string" ? r.sha256 : undefined,
    procedencia: typeof r.procedencia === "string" ? r.procedencia : undefined,
    archivo_licencia: typeof r.archivo_licencia === "string" ? r.archivo_licencia : undefined,
    atribucion_requerida: typeof r.atribucion_requerida === "boolean" ? r.atribucion_requerida : undefined,
    parche: typeof r.parche === "string" ? r.parche : undefined,
  }));

/** Reads the tree of `root`: files on disk, rows of the two registries and credits. */
export const leerArbol = (root: string): Arbol => {
  const creditos = yaml(root, RUTA_CREDITOS).atribuciones;
  return {
    root,
    archivos: {
      assets: CARPETAS_ASSETS.flatMap((d) => listar(root, d)).sort(),
      codigo: CARPETAS_CODIGO.flatMap((d) => listar(root, d)).sort(),
    },
    filas: [...filas("assets", yaml(root, RUTA_ASSETS).assets), ...filas("codigo", yaml(root, RUTA_CODIGO).codigo)],
    creditos: new Set((Array.isArray(creditos) ? creditos : []).map((c: { pack?: unknown }) => String(c.pack ?? ""))),
  };
};

export const sha256De = (abs: string): string => createHash("sha256").update(readFileSync(abs)).digest("hex");

/** The rows that cover files on disk (each file's, per registry). */
const cubiertas = (a: Arbol): Fila[] => {
  const enDisco = new Set([...a.archivos.assets, ...a.archivos.codigo]);
  return a.filas.filter((f) => enDisco.has(f.archivo));
};

/** (1) Every file has a row in ITS registry, and every code row names a file that exists. */
export const sinFila = (a: Arbol): string[] => {
  const de = (registro: Fila["registro"]): Set<string> => new Set(a.filas.filter((f) => f.registro === registro).map((f) => f.archivo));
  const assets = de("assets");
  const codigo = de("codigo");
  // Open-world-3d T7 (D-830): an edited file's `<file>.patch` is covered by that file's row (`parche`);
  // refetch.ts proves that upstream plus the patch gives the versioned bytes. A .patch that no row names fails.
  for (const f of a.filas) if (f.registro === "codigo" && f.parche !== undefined) codigo.add(f.parche);
  const enDisco = new Set(a.archivos.codigo);
  return [
    ...a.archivos.assets.filter((p) => !assets.has(p)).map((p) => `${p}: sin fila en ${RUTA_ASSETS}`),
    ...a.archivos.codigo.filter((p) => !codigo.has(p)).map((p) => `${p}: sin fila en ${RUTA_CODIGO}`),
    ...[...codigo].filter((p) => !enDisco.has(p)).map((p) => `${RUTA_CODIGO}: "${p}" no existe`),
  ];
};

/** (2) The row's sha256 is that of the bytes on disk. */
export const hashDistinto = (a: Arbol): string[] =>
  cubiertas(a).flatMap((f) => {
    if (f.sha256 === undefined) return [`${f.archivo}: la fila "${f.id}" no tiene sha256`];
    const real = sha256De(join(a.root, f.archivo));
    return real === f.sha256 ? [] : [`${f.archivo}: sha256 ${real} no coincide con la fila "${f.id}" (${f.sha256})`];
  });

/** (3) Every row that covers a file says where it came from. */
export const sinProcedencia = (a: Arbol): string[] =>
  cubiertas(a).filter((f) => f.procedencia === undefined).map((f) => `${f.archivo}: la fila "${f.id}" no tiene procedencia`);

const licenciasFuera = (a: Arbol, registro: Fila["registro"]): string[] =>
  a.filas.filter((f) => f.registro === registro && licenciaPermitida(f.licencia) === null)
    .map((f) => `${f.registro === "assets" ? RUTA_ASSETS : RUTA_CODIGO}: "${f.id}" tiene licencia "${f.licencia}", fuera de la lista D1`);

/** (4) Asset licenses in the closed D1 list. */
export const licenciaAssetFuera = (a: Arbol): string[] => licenciasFuera(a, "assets");
/** (5) Code licenses in the closed D1 list. */
export const licenciaCodigoFuera = (a: Arbol): string[] => licenciasFuera(a, "codigo");

/** (6) CC-BY carries `atribucion_requerida: true` and its line in the credits. */
export const atribucionFaltante = (a: Arbol): string[] =>
  a.filas.flatMap((f) => {
    const l = licenciaPermitida(f.licencia);
    if (f.registro !== "assets" || l === null || !LICENCIAS_CON_ATRIBUCION.includes(l)) return [];
    if (f.atribucion_requerida !== true) return [`${RUTA_ASSETS}: "${f.id}" es ${l} y no tiene atribucion_requerida: true`];
    return a.creditos.has(f.pack ?? "") ? [] : [`${RUTA_ASSETS}: "${f.id}" es ${l} y el pack "${f.pack}" no está en ${RUTA_CREDITOS}`];
  });

/** (7) MIT, Apache, BSD, ISC, 0BSD, Zlib and OFL carry `archivo_licencia`, and that file exists. */
export const archivoLicenciaFaltante = (a: Arbol): string[] =>
  a.filas.flatMap((f) => {
    if (!pideArchivoLicencia(f.licencia)) return [];
    if (f.archivo_licencia === undefined) return [`"${f.id}" es ${f.licencia} y no tiene archivo_licencia`];
    return existsSync(join(a.root, f.archivo_licencia)) ? [] : [`"${f.id}": archivo_licencia ${f.archivo_licencia} no existe`];
  });
