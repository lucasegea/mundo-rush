// Registro de licencias de assets y créditos (03 §6.4.2, D-153; plan estetica-c M2, D-207). Claves en español
// snake_case (D-090). Todo archivo servido en apps/web/public/{models,textures,audio,sprites} tiene una fila acá; el
// compilador lo cruza con la lista real de archivos que le pasa scripts/content/build.ts (el compilador sigue puro).
import { z } from "zod";

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

/** Licencias que el juego no puede usar (D-153): no comercial o solo uso personal, en cualquier grafía. */
export const LICENCIA_PROHIBIDA = /no[\s_-]*comercial|non[\s_-]*commercial|(^|[^a-z])nc([^a-z]|$)|solo[\s_-]*uso[\s_-]*personal|personal[\s_-]*use/i;

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
  /** Tarea de verificación que lo cerró (V1 a V5). */
  verificacion: z.array(z.enum(["V1", "V2", "V3", "V4", "V5"])).min(1),
  estado: z.enum(["usado", "descartado", "diferido", "pendiente"]),
  razon: z.string().min(1),
  fuente_investigacion: z.string().min(1),
  // M2 SEAM: en M5 content-schema importa @lg/art y valida que cada token de `pintura` exista en la paleta; hoy lo
  // valida scripts/assets/optimize.ts al repintar (falla nombrando el material y el token).
  pintura: z.record(z.string().min(1), z.string().min(1)).optional(),
});
export type PackAssets = z.infer<typeof PackAssets>;

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
  url_origen: Url,
  fecha_descarga: Fecha,
  sha256_original: z.string().regex(/^[0-9a-f]{64}$/, "sha256 en hex"),
  modificaciones: z.string().min(1),
  atribucion_requerida: z.boolean(),
  bisel: Bisel.optional(),
  bisel_razon: z.string().min(1).optional(),
  notas: z.string().min(1).optional(),
}).refine((r) => r.bisel === undefined || r.bisel_razon !== undefined, { message: "bisel sin bisel_razon", path: ["bisel_razon"] });
export type RegistroAsset = z.infer<typeof RegistroAsset>;

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
