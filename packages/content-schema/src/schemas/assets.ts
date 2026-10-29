// Registro de licencias de assets y créditos (03 §6.4.2, D-153; plan estetica-c M2, D-207). Claves en español
// snake_case (D-090). Todo archivo servido en apps/web/public/{models,textures,audio,sprites} tiene una fila acá; el
// compilador lo cruza con la lista real de archivos que le pasa scripts/content/build.ts (el compilador sigue puro).
import { z } from "zod";
import { TokenPaleta } from "./mundo.ts";

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
const Url = z.string().regex(/^https:\/\//, "url https://");
/** Id de pack y de pieza: minúsculas, dígitos y guiones (la pieza va como `<pack>/<pieza>`). */
const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "minúsculas, dígitos y guiones");

/** Carpetas servidas que exigen registro (03 §6.4.2). */
export const CARPETAS_CON_REGISTRO = [
  "apps/web/public/models/",
  "apps/web/public/textures/",
  "apps/web/public/audio/",
  "apps/web/public/sprites/",
] as const;

/**
 * Licencias que el juego puede usar: la política D1 de libre uso (open-world-3d T2(c), D-831; amplía D-153). Lista
 * cerrada (nota N1 de QA en M2): una lista de prohibidas dejaba pasar "sólo uso personal" con tilde o "uso personal" a
 * secas; con la lista cerrada, toda grafía de "no comercial", "sin derivadas", "compartir igual" (CC-BY-SA), GPL, LGPL,
 * AGPL o "uso personal", y toda licencia desconocida, falla cerrada. CC-BY exige `atribucion_requerida: true` (créditos);
 * las licencias de software exigen `archivo_licencia` (el texto de la licencia versionado en el repo).
 */
export const LICENCIAS_PERMITIDAS = [
  "CC0-1.0", "CC-BY-3.0", "CC-BY-4.0", "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Zlib", "OFL-1.1",
] as const;
export type LicenciaPermitida = (typeof LICENCIAS_PERMITIDAS)[number];
/** Las que piden atribución en los créditos. */
export const LICENCIAS_CON_ATRIBUCION: readonly LicenciaPermitida[] = ["CC-BY-3.0", "CC-BY-4.0"];
/** Las que piden el texto de la licencia junto a la copia (`archivo_licencia`). */
export const LICENCIAS_CON_ARCHIVO: readonly LicenciaPermitida[] = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Zlib", "OFL-1.1"];

/** Mayúsculas, sin tildes y con guiones en lugar de espacios o guiones bajos ("cc0 1.0" → "CC0-1.0"). */
const normalizarLicencia = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").trim().toUpperCase().replace(/[\s_]+/g, "-");

/** La licencia permitida que nombra el texto, o null si no está en la lista (no comercial, uso personal o desconocida). */
export const licenciaPermitida = (licencia: string): LicenciaPermitida | null => {
  const n = normalizarLicencia(licencia);
  return LICENCIAS_PERMITIDAS.find((l) => normalizarLicencia(l) === n) ?? null;
};

/** ¿La licencia pide su texto versionado (`archivo_licencia`)? */
export const pideArchivoLicencia = (licencia: string): boolean => {
  const l = licenciaPermitida(licencia);
  return l !== null && LICENCIAS_CON_ARCHIVO.includes(l);
};

/** El LICENSE de ez-tree vendorizado: la licencia de todo árbol generado (D-831, lectura conservadora: MIT). */
export const LICENCIA_EZ_TREE = "tooling/vendor/ez-tree/LICENSE";

/** De dónde salen los bytes servidos (D-831): bajados tal cual, derivados por el pipeline, generados o editados. */
export const Procedencia = z.enum(["refetched", "derived", "generated", "edited"]);
export type Procedencia = z.infer<typeof Procedencia>;
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "sha256 en hex");
/** Ruta de un archivo de texto de licencia versionado en el repo (relativa a la raíz, sin `..`). */
const RutaLicencia = z.string().regex(/^(?!\/)(?!.*\.\.)[\w./-]+$/, "ruta desde la raíz del repo");

/** Qué hace el pipeline con una pieza que no pasa la regla del bisel (plan estetica-c M2). */
export const Bisel = z.enum(["rehecho_por_codigo", "aceptado"]);

/**
 * Un pack evaluado (las tareas de verificación V1 a V5 de M2): usado, descartado (con la razón), diferido (necesita al
 * operador: login, compra o descarga por navegador) o pendiente. `pintura` es la tabla del pack de nombre de material de
 * origen a token de la paleta (`*` = cualquier otro); la usa scripts/assets/optimize.ts.
 */
export const PackAssets = z.strictObject({
  id: Slug,
  nombre: z.string().min(1),
  autor: z.string().min(1),
  licencia: z.string().min(1),
  url: Url,
  fecha_acceso: Fecha,
  /** Tarea de verificación que lo cerró (V1 a V5 de estetica-c M2; D1, la política de libre uso de open-world-3d). */
  verificacion: z.array(z.enum(["V1", "V2", "V3", "V4", "V5", "D1"])).min(1),
  estado: z.enum(["usado", "descartado", "diferido", "pendiente"]),
  razon: z.string().min(1),
  fuente_investigacion: z.string().min(1),
  /** Cada valor es un token de la paleta de @lg/art (plan estetica-c M6, el M2 SEAM cerrado): falla al validar, no al repintar. */
  pintura: z.record(z.string().min(1), TokenPaleta).optional(),
});
export type PackAssets = z.infer<typeof PackAssets>;

const HexColor = z.string().regex(/^#[0-9a-f]{6}$/, "#rrggbb en minúsculas");

/**
 * Una regla de pintura de un cuerpo (plan estetica-c M3): toma el vértice si el hueso que más lo mueve está en `huesos`
 * y/o si el color de la textura de paleta en su UV está a menos de `radio` de `color`. Pinta con `token` o marca la
 * prenda (`ropa`) que world/ repinta con el color de cada personaje. Las reglas se prueban en orden.
 */
export const ReglaPinturaPersonaje = z.strictObject({
  huesos: z.array(z.string().min(1)).min(1).optional(),
  color: HexColor.optional(),
  radio: z.number().positive().max(1).optional(),
  token: TokenPaleta.optional(),
  ropa: z.enum(["remera", "pantalon"]).optional(),
}).refine((r) => (r.token === undefined) !== (r.ropa === undefined), { message: "una regla lleva token o ropa (una de las dos)" })
  .refine((r) => r.radio === undefined || r.color !== undefined, { message: "radio sin color", path: ["radio"] });
export type ReglaPinturaPersonaje = z.infer<typeof ReglaPinturaPersonaje>;

/**
 * Una pieza de personaje (plan estetica-c M3): un cuerpo con esqueleto (las mallas que quedan y sus reglas de pintura) o
 * el archivo de clips del esqueleto (los clips que quedan). Las cabezas, el pelo y los accesorios son código hasta M5.
 * Plan estetica-c M6: `simplificar` (fracción de triángulos que quedan) hace el cuerpo de la densidad reducida de `low`.
 */
export const PiezaPersonaje = z.discriminatedUnion("tipo", [
  z.strictObject({
    tipo: z.literal("cuerpo"), nodos: z.array(z.string().min(1)).min(1), pintura: z.array(ReglaPinturaPersonaje).min(1),
    simplificar: z.number().gt(0).lt(1).optional(),
  }),
  z.strictObject({ tipo: z.literal("animaciones"), clips: z.array(z.string().min(1)).min(1) }),
]);
export type PiezaPersonaje = z.infer<typeof PiezaPersonaje>;

/** Una pieza servida (03 §6.4.2). */
export const RegistroAsset = z.strictObject({
  /** `<pack>/<pieza>`; un diorama la usa como `modelo/<pack>/<pieza>`. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/, "<pack>/<pieza> en minúsculas"),
  archivo: z.string().regex(/^apps\/web\/public\//, "ruta desde la raíz del repo (apps/web/public/...)"),
  /** Archivo original bajado, en assets-src/ (gitignored, D-099); optimize.ts lo lee. */
  fuente: z.string().regex(/^assets-src\//, "ruta en assets-src/").optional(),
  pack: Slug,
  autor: z.string().min(1),
  licencia: z.string().min(1),
  /** Opcionales solo para `procedencia: generated` (un árbol horneado no tiene original bajado); el refine las exige. */
  url_origen: Url.optional(),
  fecha_descarga: Fecha.optional(),
  sha256_original: Sha256.optional(),
  /**
   * Open-world-3d T7: los demás originales de una fila que sale de varios (el .bin de un glTF, los cuatro escaneos de un
   * atlas). `url_origen` y `sha256_original` son el primero; refetch.ts baja y verifica cada uno.
   */
  fuentes_extra: z.array(z.strictObject({ url: Url, sha256: Sha256 })).min(1).optional(),
  modificaciones: z.string().min(1),
  /**
   * open-world-3d T2(c), D-831: sha256 de los bytes SERVIDOS y su procedencia. Opcionales en el esquema (las filas
   * viejas validan igual); el test de procedencia (scripts/content/provenance.test.ts) los exige en todo archivo servido.
   */
  sha256: Sha256.optional(),
  procedencia: Procedencia.optional(),
  /** El texto de la licencia versionado en el repo (lo exigen MIT, Apache, BSD, ISC, 0BSD, Zlib y OFL). */
  archivo_licencia: RutaLicencia.optional(),
  /** Solo `generated`: el script que lo generó, su sha256, el preset y la semilla (reproducible byte a byte). */
  generador: z.strictObject({
    archivo: z.string().regex(/^scripts\//, "script del repo (scripts/...)"),
    sha256: Sha256,
    preset: z.string().min(1),
    semilla: z.number().int(),
  }).optional(),
  atribucion_requerida: z.boolean(),
  bisel: Bisel.optional(),
  bisel_razon: z.string().min(1).optional(),
  /** Plan estetica-c M3: la fila es un cuerpo con esqueleto o un archivo de clips (scripts/assets/characters.ts). */
  personaje: PiezaPersonaje.optional(),
  /**
   * Plan estetica-c M5: triángulos y primitivas (una llamada cada una) del .glb servido. Los usa el estimador de
   * presupuesto de validate:content (que no lee .glb); check:budgets los compara con el archivo y falla si no coinciden.
   */
  triangulos: z.number().int().min(0).optional(),
  primitivas: z.number().int().min(0).optional(),
  notas: z.string().min(1).optional(),
}).refine((r) => r.bisel === undefined || r.bisel_razon !== undefined, { message: "bisel sin bisel_razon", path: ["bisel_razon"] })
  .superRefine((r, ctx) => {
    const falta = (campo: string, mensaje: string): void => { ctx.addIssue({ code: "custom", path: [campo], message: mensaje }); };
    if (r.procedencia === "generated") {
      if (!r.generador) falta("generador", "una fila generated lleva generador {archivo, sha256, preset, semilla}");
      if (licenciaPermitida(r.licencia) !== "MIT") falta("licencia", "una fila generated es MIT (la licencia de ez-tree, D-831)");
      if (r.archivo_licencia !== LICENCIA_EZ_TREE) falta("archivo_licencia", `una fila generated apunta a ${LICENCIA_EZ_TREE}`);
    } else {
      for (const campo of ["url_origen", "fecha_descarga", "sha256_original"] as const) {
        if (r[campo] === undefined) falta(campo, `${campo} es obligatorio salvo en procedencia generated`);
      }
      if (r.generador !== undefined) falta("generador", "generador va solo con procedencia generated");
    }
    if (pideArchivoLicencia(r.licencia) && r.archivo_licencia === undefined) {
      falta("archivo_licencia", `${r.licencia} lleva archivo_licencia (el texto de la licencia en el repo)`);
    }
  });
export type RegistroAsset = z.infer<typeof RegistroAsset>;

/** Carpetas de código de terceros que exigen fila en content/code-registry.yaml (D-831). */
export const CARPETAS_DE_CODIGO = ["tooling/vendor/", "apps/web/public/decoders/"] as const;

const PaqueteVersion = z.string().regex(/^(@[a-z0-9-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+\S*$/, "paquete@version");

/**
 * Una pieza de CÓDIGO de terceros (D-831): un archivo vendorizado bajo tooling/vendor/ o un decodificador servido bajo
 * apps/web/public/decoders/. Esquema hermano de RegistroAsset: su `id` y su `archivo` no entran en las regex de
 * RegistroAsset (y viceversa). `sha256_original` es el del archivo upstream; si `editado`, el `parche` aplicado a esos
 * bytes reproduce `sha256` (lo comprueba scripts/assets/refetch.ts).
 */
export const RegistroCodigo = z.strictObject({
  /** `<paquete>/<ruta upstream>` en minúsculas (`ez-tree/src/tree.js`). */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9_./-]+$/, "<paquete>/<ruta upstream>"),
  archivo: z.string().regex(/^(tooling\/vendor\/|apps\/web\/public\/decoders\/)/, "ruta bajo tooling/vendor/ o apps/web/public/decoders/"),
  /** `nombre@version` del paquete upstream. */
  paquete: PaqueteVersion,
  autor: z.string().min(1),
  licencia: z.string().min(1),
  archivo_licencia: RutaLicencia.optional(),
  url_origen: Url,
  fecha_descarga: Fecha,
  sha256_original: Sha256,
  sha256: Sha256.optional(),
  procedencia: Procedencia.optional(),
  editado: z.boolean(),
  /** El `<archivo>.patch` contra los bytes upstream (obligatorio si `editado`). */
  parche: z.string().regex(/^tooling\/vendor\/.+\.patch$/, "tooling/vendor/<...>.patch").optional(),
  notas: z.string().min(1).optional(),
}).superRefine((r, ctx) => {
  if (r.editado && r.parche === undefined) ctx.addIssue({ code: "custom", path: ["parche"], message: "un archivo editado lleva su parche" });
  if (!r.editado && r.parche !== undefined) ctx.addIssue({ code: "custom", path: ["parche"], message: "parche solo en un archivo editado" });
  if (pideArchivoLicencia(r.licencia) && r.archivo_licencia === undefined) {
    ctx.addIssue({ code: "custom", path: ["archivo_licencia"], message: `${r.licencia} lleva archivo_licencia (el texto de la licencia en el repo)` });
  }
});
export type RegistroCodigo = z.infer<typeof RegistroCodigo>;

export const ArchivoRegistroCodigo = z.strictObject({ codigo: z.array(RegistroCodigo) });
export type ArchivoRegistroCodigo = z.infer<typeof ArchivoRegistroCodigo>;

/**
 * Overrides de licencia de npm (AC9): un paquete del cierre de producción de apps/web sin `license` en el lockfile
 * lleva la licencia leída a mano de su LICENSE, con el sha256 de ese archivo en node_modules y la fecha de la lectura.
 */
export const ArchivoOverridesNpm = z.strictObject({
  overrides: z.record(PaqueteVersion, z.strictObject({ license: z.string().min(1), license_file_sha256: Sha256, verified: Fecha })),
});
export type ArchivoOverridesNpm = z.infer<typeof ArchivoOverridesNpm>;

export const ArchivoRegistroAssets = z.strictObject({
  packs: z.array(PackAssets).min(1),
  assets: z.array(RegistroAsset),
});
export type ArchivoRegistroAssets = z.infer<typeof ArchivoRegistroAssets>;

/** Créditos (03 §6.4.2): la pantalla de créditos se genera de acá (`creditos.json` del cliente). */
export const ArchivoCreditos = z.strictObject({
  atribuciones: z.array(z.strictObject({
    /** Pack del registro al que da crédito. */
    pack: Slug,
    texto: z.string().min(1),
  })),
});
export type ArchivoCreditos = z.infer<typeof ArchivoCreditos>;

/** Prefijo de los props de diorama que son glTF del pipeline (el resto, `codigo/*`, son constructores por código). */
export const PREFIJO_MODELO = "modelo/";
/** `modelo/<pack>/<pieza>` → ruta del .glb servido. */
export const archivoDeModelo = (asset: string): string => `apps/web/public/models/${asset.slice(PREFIJO_MODELO.length)}.glb`;
