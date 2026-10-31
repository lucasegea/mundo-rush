// Asset license and credits registry (03 §6.4.2, D-153; plan estetica-c M2, D-207). Spanish snake_case
// keys (D-090). Every file served in apps/web/public/{models,textures,audio,sprites} has a row here; the
// compiler cross-checks it with the real file list that scripts/content/build.ts passes it (the compiler stays pure).
import { z } from "zod";
import { TokenPaleta } from "./mundo.ts";

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
const Url = z.string().regex(/^https:\/\//, "url https://");
/** Pack and piece id: lowercase, digits and hyphens (the piece goes as `<pack>/<pieza>`). */
const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "minúsculas, dígitos y guiones");

/** Served folders that require a registry entry (03 §6.4.2). */
export const CARPETAS_CON_REGISTRO = [
  "apps/web/public/models/",
  "apps/web/public/textures/",
  "apps/web/public/audio/",
  "apps/web/public/sprites/",
] as const;

/**
 * Licenses the game may use: the free-use policy D1 (open-world-3d T2(c), D-831; extends D-153). Closed
 * list (QA's note N1 in M2): a list of prohibited ones let through "sólo uso personal" with an accent or a bare
 * "uso personal"; with the closed list, any spelling of "no comercial", "sin derivadas", "compartir igual" (CC-BY-SA), GPL, LGPL,
 * AGPL or "uso personal", and any unknown license, fails closed. CC-BY requires `atribucion_requerida: true` (credits);
 * software licenses require `archivo_licencia` (the license text versioned in the repo).
 */
export const LICENCIAS_PERMITIDAS = [
  "CC0-1.0", "CC-BY-3.0", "CC-BY-4.0", "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Zlib", "OFL-1.1",
] as const;
export type LicenciaPermitida = (typeof LICENCIAS_PERMITIDAS)[number];
/** The ones that require attribution in the credits. */
export const LICENCIAS_CON_ATRIBUCION: readonly LicenciaPermitida[] = ["CC-BY-3.0", "CC-BY-4.0"];
/** The ones that require the license text next to the copy (`archivo_licencia`). */
export const LICENCIAS_CON_ARCHIVO: readonly LicenciaPermitida[] = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Zlib", "OFL-1.1"];

/** Uppercase, accent-free and with hyphens instead of spaces or underscores ("cc0 1.0" → "CC0-1.0"). */
const normalizarLicencia = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").trim().toUpperCase().replace(/[\s_]+/g, "-");

/** The allowed license that the text names, or null if it is not in the list (non-commercial, personal use or unknown). */
export const licenciaPermitida = (licencia: string): LicenciaPermitida | null => {
  const n = normalizarLicencia(licencia);
  return LICENCIAS_PERMITIDAS.find((l) => normalizarLicencia(l) === n) ?? null;
};

/** Does the license require its versioned text (`archivo_licencia`)? */
export const pideArchivoLicencia = (licencia: string): boolean => {
  const l = licenciaPermitida(licencia);
  return l !== null && LICENCIAS_CON_ARCHIVO.includes(l);
};

/** The vendored ez-tree LICENSE: the license of every generated tree (D-831, conservative reading: MIT). */
export const LICENCIA_EZ_TREE = "tooling/vendor/ez-tree/LICENSE";

/** Where the served bytes come from (D-831): downloaded as is, derived by the pipeline, generated or edited. */
export const Procedencia = z.enum(["refetched", "derived", "generated", "edited"]);
export type Procedencia = z.infer<typeof Procedencia>;
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "sha256 en hex");
/** Path of a license text file versioned in the repo (relative to the root, without `..`). */
const RutaLicencia = z.string().regex(/^(?!\/)(?!.*\.\.)[\w./-]+$/, "ruta desde la raíz del repo");

/** What the pipeline does with a piece that fails the bevel rule (plan estetica-c M2). */
export const Bisel = z.enum(["rehecho_por_codigo", "aceptado"]);

/**
 * An evaluated pack (the verification tasks V1 to V5 of M2): used, discarded (with the reason), deferred (needs the
 * operator: login, purchase or browser download) or pending. `pintura` is the pack's table from source material name
 * to palette token (`*` = any other); used by scripts/assets/optimize.ts.
 */
export const PackAssets = z.strictObject({
  id: Slug,
  nombre: z.string().min(1),
  autor: z.string().min(1),
  licencia: z.string().min(1),
  url: Url,
  fecha_acceso: Fecha,
  /** Verification task that closed it (V1 to V5 of estetica-c M2; D1, open-world-3d's free-use policy). */
  verificacion: z.array(z.enum(["V1", "V2", "V3", "V4", "V5", "D1"])).min(1),
  estado: z.enum(["usado", "descartado", "diferido", "pendiente"]),
  razon: z.string().min(1),
  fuente_investigacion: z.string().min(1),
  /** Each value is a @lg/art palette token (plan estetica-c M6, the M2 SEAM closed): fails at validation, not at repainting. */
  pintura: z.record(z.string().min(1), TokenPaleta).optional(),
});
export type PackAssets = z.infer<typeof PackAssets>;

const HexColor = z.string().regex(/^#[0-9a-f]{6}$/, "#rrggbb en minúsculas");

/**
 * A paint rule of a body (plan estetica-c M3): takes the vertex if the bone that moves it most is in `huesos`
 * and/or if the palette texture color at its UV is within `radio` of `color`. Paints with `token` or marks the
 * garment (`ropa`) that world/ repaints with each character's color. Rules are tried in order.
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
 * A character piece (plan estetica-c M3): a skeletal body (the meshes that remain and their paint rules) or
 * the skeleton's clips file (the clips that remain). Heads, hair and accessories are code until M5.
 * Plan estetica-c M6: `simplificar` (fraction of triangles that remain) makes the reduced-density body of `low`.
 */
export const PiezaPersonaje = z.discriminatedUnion("tipo", [
  z.strictObject({
    tipo: z.literal("cuerpo"), nodos: z.array(z.string().min(1)).min(1), pintura: z.array(ReglaPinturaPersonaje).min(1),
    simplificar: z.number().gt(0).lt(1).optional(),
  }),
  z.strictObject({ tipo: z.literal("animaciones"), clips: z.array(z.string().min(1)).min(1) }),
]);
export type PiezaPersonaje = z.infer<typeof PiezaPersonaje>;

/** A served piece (03 §6.4.2). */
export const RegistroAsset = z.strictObject({
  /** `<pack>/<pieza>`; a diorama uses it as `modelo/<pack>/<pieza>`. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/, "<pack>/<pieza> en minúsculas"),
  archivo: z.string().regex(/^apps\/web\/public\//, "ruta desde la raíz del repo (apps/web/public/...)"),
  /** Original downloaded file, in assets-src/ (gitignored, D-099); optimize.ts reads it. */
  fuente: z.string().regex(/^assets-src\//, "ruta en assets-src/").optional(),
  pack: Slug,
  autor: z.string().min(1),
  licencia: z.string().min(1),
  /** Optional only for `procedencia: generated` (a baked tree has no downloaded original); the refine requires them. */
  url_origen: Url.optional(),
  fecha_descarga: Fecha.optional(),
  sha256_original: Sha256.optional(),
  /**
   * Open-world-3d T7: the other originals of a row that comes from several (a glTF's .bin, the four scans of an
   * atlas). `url_origen` and `sha256_original` are the first one; refetch.ts downloads and verifies each.
   */
  fuentes_extra: z.array(z.strictObject({ url: Url, sha256: Sha256 })).min(1).optional(),
  modificaciones: z.string().min(1),
  /**
   * open-world-3d T2(c), D-831: sha256 of the SERVED bytes and their provenance. Optional in the schema (old
   * rows validate the same); the provenance test (scripts/content/provenance.test.ts) requires them on every served file.
   */
  sha256: Sha256.optional(),
  procedencia: Procedencia.optional(),
  /** The license text versioned in the repo (required by MIT, Apache, BSD, ISC, 0BSD, Zlib and OFL). */
  archivo_licencia: RutaLicencia.optional(),
  /** `generated` only: the script that generated it, its sha256, the preset and the seed (reproducible byte for byte). */
  generador: z.strictObject({
    archivo: z.string().regex(/^scripts\//, "script del repo (scripts/...)"),
    sha256: Sha256,
    preset: z.string().min(1),
    semilla: z.number().int(),
  }).optional(),
  atribucion_requerida: z.boolean(),
  bisel: Bisel.optional(),
  bisel_razon: z.string().min(1).optional(),
  /** Plan estetica-c M3: the row is a skeletal body or a clips file (scripts/assets/characters.ts). */
  personaje: PiezaPersonaje.optional(),
  /**
   * Plan estetica-c M5: triangles and primitives (one call each) of the served .glb. Used by the validate:content
   * budget estimator (which does not read .glb); check:budgets compares them with the file and fails if they do not match.
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

/** Third-party code folders that require a row in content/code-registry.yaml (D-831). */
export const CARPETAS_DE_CODIGO = ["tooling/vendor/", "apps/web/public/decoders/"] as const;

const PaqueteVersion = z.string().regex(/^(@[a-z0-9-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+\S*$/, "paquete@version");

/**
 * A third-party CODE piece (D-831): a vendored file under tooling/vendor/ or a decoder served under
 * apps/web/public/decoders/. Sibling schema of RegistroAsset: its `id` and `archivo` do not enter the regexes of
 * RegistroAsset (and vice versa). `sha256_original` is the upstream file's; if `editado`, the `parche` applied to those
 * bytes reproduces `sha256` (checked by scripts/assets/refetch.ts).
 */
export const RegistroCodigo = z.strictObject({
  /** `<package>/<upstream path>` in lowercase (`ez-tree/src/tree.js`). */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9_./-]+$/, "<paquete>/<ruta upstream>"),
  archivo: z.string().regex(/^(tooling\/vendor\/|apps\/web\/public\/decoders\/)/, "ruta bajo tooling/vendor/ o apps/web/public/decoders/"),
  /** `name@version` of the upstream package. */
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
  /** The `<file>.patch` against the upstream bytes (required if `editado`). */
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
 * npm license overrides (AC9): a package from apps/web's production closure without `license` in the lockfile
 * carries the license read by hand from its LICENSE, with the sha256 of that file in node_modules and the reading date.
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

/** Credits (03 §6.4.2): the credits screen is generated from here (the client's `creditos.json`). */
export const ArchivoCreditos = z.strictObject({
  atribuciones: z.array(z.strictObject({
    /** Registry pack that it credits. */
    pack: Slug,
    texto: z.string().min(1),
  })),
});
export type ArchivoCreditos = z.infer<typeof ArchivoCreditos>;

/** Prefix of the diorama props that are pipeline glTFs (the rest, `codigo/*`, are code constructors). */
export const PREFIJO_MODELO = "modelo/";
/** `modelo/<pack>/<pieza>` → path of the served .glb. */
export const archivoDeModelo = (asset: string): string => `apps/web/public/models/${asset.slice(PREFIJO_MODELO.length)}.glb`;
