// Procedencia de cada byte de terceros (open-world-3d T2(c), D-831, AC8). Recalcula el sha256 de todo archivo servido
// (apps/web/public/{models,textures,audio,sprites,decoders}) y vendorizado (tooling/vendor/) y lo cruza con su fila:
// content/assets-registry.yaml para los assets, content/code-registry.yaml para el código. Lee los YAML crudos (sin el
// esquema zod) a propósito: cada chequeo es independiente, así una fila mala enciende SOLO el chequeo que le toca y no
// tumba el parseo de los demás. El esquema (packages/content-schema) valida lo mismo al compilar; esto lo prueba en disco.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "yaml";
import { LICENCIAS_CON_ATRIBUCION, licenciaPermitida, pideArchivoLicencia } from "@lg/content-schema";

/** Carpetas cuyos archivos van en el registro de assets. */
export const CARPETAS_ASSETS = ["apps/web/public/models", "apps/web/public/textures", "apps/web/public/audio", "apps/web/public/sprites"] as const;
/** Carpetas cuyos archivos van en el registro de código. */
export const CARPETAS_CODIGO = ["apps/web/public/decoders", "tooling/vendor"] as const;

export const RUTA_ASSETS = "content/assets-registry.yaml";
export const RUTA_CODIGO = "content/code-registry.yaml";
export const RUTA_CREDITOS = "content/creditos.yaml";

/** Una fila cruda (asset o código), con los campos que miran los chequeos. */
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
  /** Solo código editado: su `<archivo>.patch` (open-world-3d T7). */
  parche?: string | undefined;
}

export interface Arbol {
  root: string;
  /** Archivos en disco bajo las carpetas de assets y de código (rutas posix desde root), ordenados. */
  archivos: { assets: string[]; codigo: string[] };
  filas: Fila[];
  /** Packs con entrada en content/creditos.yaml. */
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

/** Lee el árbol de `root`: archivos en disco, filas de los dos registros y créditos. */
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

/** Las filas que cubren archivos en disco (la de cada archivo, por registro). */
const cubiertas = (a: Arbol): Fila[] => {
  const enDisco = new Set([...a.archivos.assets, ...a.archivos.codigo]);
  return a.filas.filter((f) => enDisco.has(f.archivo));
};

/** (1) Todo archivo tiene fila en SU registro, y toda fila de código nombra un archivo que existe. */
export const sinFila = (a: Arbol): string[] => {
  const de = (registro: Fila["registro"]): Set<string> => new Set(a.filas.filter((f) => f.registro === registro).map((f) => f.archivo));
  const assets = de("assets");
  const codigo = de("codigo");
  // Open-world-3d T7 (D-830): el `<archivo>.patch` de un archivo editado lo cubre la fila de ese archivo (`parche`);
  // refetch.ts prueba que el upstream más el parche da los bytes versionados. Un .patch que ninguna fila nombra falla.
  for (const f of a.filas) if (f.registro === "codigo" && f.parche !== undefined) codigo.add(f.parche);
  const enDisco = new Set(a.archivos.codigo);
  return [
    ...a.archivos.assets.filter((p) => !assets.has(p)).map((p) => `${p}: sin fila en ${RUTA_ASSETS}`),
    ...a.archivos.codigo.filter((p) => !codigo.has(p)).map((p) => `${p}: sin fila en ${RUTA_CODIGO}`),
    ...[...codigo].filter((p) => !enDisco.has(p)).map((p) => `${RUTA_CODIGO}: "${p}" no existe`),
  ];
};

/** (2) El sha256 de la fila es el de los bytes en disco. */
export const hashDistinto = (a: Arbol): string[] =>
  cubiertas(a).flatMap((f) => {
    if (f.sha256 === undefined) return [`${f.archivo}: la fila "${f.id}" no tiene sha256`];
    const real = sha256De(join(a.root, f.archivo));
    return real === f.sha256 ? [] : [`${f.archivo}: sha256 ${real} no coincide con la fila "${f.id}" (${f.sha256})`];
  });

/** (3) Toda fila que cubre un archivo dice de dónde salió. */
export const sinProcedencia = (a: Arbol): string[] =>
  cubiertas(a).filter((f) => f.procedencia === undefined).map((f) => `${f.archivo}: la fila "${f.id}" no tiene procedencia`);

const licenciasFuera = (a: Arbol, registro: Fila["registro"]): string[] =>
  a.filas.filter((f) => f.registro === registro && licenciaPermitida(f.licencia) === null)
    .map((f) => `${f.registro === "assets" ? RUTA_ASSETS : RUTA_CODIGO}: "${f.id}" tiene licencia "${f.licencia}", fuera de la lista D1`);

/** (4) Licencias de los assets en la lista cerrada D1. */
export const licenciaAssetFuera = (a: Arbol): string[] => licenciasFuera(a, "assets");
/** (5) Licencias del código en la lista cerrada D1. */
export const licenciaCodigoFuera = (a: Arbol): string[] => licenciasFuera(a, "codigo");

/** (6) CC-BY lleva `atribucion_requerida: true` y su línea en los créditos. */
export const atribucionFaltante = (a: Arbol): string[] =>
  a.filas.flatMap((f) => {
    const l = licenciaPermitida(f.licencia);
    if (f.registro !== "assets" || l === null || !LICENCIAS_CON_ATRIBUCION.includes(l)) return [];
    if (f.atribucion_requerida !== true) return [`${RUTA_ASSETS}: "${f.id}" es ${l} y no tiene atribucion_requerida: true`];
    return a.creditos.has(f.pack ?? "") ? [] : [`${RUTA_ASSETS}: "${f.id}" es ${l} y el pack "${f.pack}" no está en ${RUTA_CREDITOS}`];
  });

/** (7) MIT, Apache, BSD, ISC, 0BSD, Zlib y OFL llevan `archivo_licencia`, y ese archivo existe. */
export const archivoLicenciaFaltante = (a: Arbol): string[] =>
  a.filas.flatMap((f) => {
    if (!pideArchivoLicencia(f.licencia)) return [];
    if (f.archivo_licencia === undefined) return [`"${f.id}" es ${f.licencia} y no tiene archivo_licencia`];
    return existsSync(join(a.root, f.archivo_licencia)) ? [] : [`"${f.id}": archivo_licencia ${f.archivo_licencia} no existe`];
  });
