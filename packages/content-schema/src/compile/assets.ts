// Checks of the asset license registry (03 §6.4.2, D-153; plan estetica-c M2). Pure: the list of served files
// arrives as data (built by scripts/content/build.ts). The build fails if a served file has no registry entry, if
// a license is not in the closed list (M3, note N1: CC0-1.0 and CC-BY-4.0 with attribution), if a registry entry with
// mandatory attribution is not in the credits, or if a diorama uses a `modelo/*` with no registry entry.
import { archivoDeModelo, CARPETAS_CON_REGISTRO, LICENCIAS_CON_ATRIBUCION, LICENCIAS_PERMITIDAS, licenciaPermitida, PREFIJO_MODELO } from "../schemas/assets.ts";
import type { Conjunto } from "./conjunto.ts";
import type { Hallazgo } from "./tipos.ts";

const RUTA_REGISTRO = "content/assets-registry.yaml";
const RUTA_CODIGO = "content/code-registry.yaml";
const RUTA_CREDITOS = "content/creditos.yaml";
const FUERA_DE_LISTA = `fuera de la lista permitida (${LICENCIAS_PERMITIDAS.join(", ")}): no comercial, sin derivadas, compartir igual, GPL, uso personal o desconocida no se puede usar (D-153, D-831)`;

/** Does this served file need a registry entry? (models, textures, audio, sprites; 03 §6.4.2). */
export const necesitaRegistro = (ruta: string): boolean => CARPETAS_CON_REGISTRO.some((c) => ruta.startsWith(c));

/**
 * `publicos`: paths from the repo root of the files served in apps/web/public (without the generated content).
 * Without the list (compiler tests with synthetic content) only the cross-checks against disk are skipped.
 */
export const chequearAssets = (c: Conjunto, h: Hallazgo[], publicos?: readonly string[]): void => {
  const err = (archivo: string, clave: string, mensaje: string): void => {
    h.push({ nivel: "error", archivo, clave, regla: "registro-assets", mensaje });
  };
  const reg = c.registroAssets?.data ?? null;
  const filas = reg?.assets ?? [];
  const porArchivo = new Map(filas.map((a) => [a.archivo, a]));
  const porId = new Map(filas.map((a) => [a.id, a]));
  const servidos = publicos ? new Set(publicos) : null;

  for (const ruta of (publicos ?? []).filter(necesitaRegistro)) {
    if (!porArchivo.has(ruta)) err(ruta, "", `archivo servido sin registro en ${RUTA_REGISTRO} (03 §6.4.2)`);
  }

  if (reg) {
    const packs = new Map(reg.packs.map((p) => [p.id, p]));
    reg.packs.forEach((p, i) => {
      // A discarded, deferred or pending pack is the record of an evaluation: it may name a license that is unusable.
      if (p.estado === "usado" && !licenciaPermitida(p.licencia)) {
        err(RUTA_REGISTRO, `packs[${i}].licencia`, `el pack "${p.id}" tiene licencia "${p.licencia}", ${FUERA_DE_LISTA}`);
      }
    });
    const vistos = new Set<string>();
    filas.forEach((a, i) => {
      const k = `assets[${i}]`;
      if (vistos.has(a.archivo)) err(RUTA_REGISTRO, `${k}.archivo`, `"${a.archivo}" registrado dos veces`);
      vistos.add(a.archivo);
      const licencia = licenciaPermitida(a.licencia);
      if (!licencia) err(RUTA_REGISTRO, `${k}.licencia`, `"${a.id}" tiene licencia "${a.licencia}", ${FUERA_DE_LISTA}`);
      else if (LICENCIAS_CON_ATRIBUCION.includes(licencia) && !a.atribucion_requerida) {
        err(RUTA_REGISTRO, `${k}.atribucion_requerida`, `"${a.id}" es ${licencia}: lleva atribucion_requerida: true y su crédito`);
      }
      const pack = packs.get(a.pack);
      if (!pack) err(RUTA_REGISTRO, `${k}.pack`, `"${a.id}": el pack "${a.pack}" no está en packs`);
      else if (pack.estado !== "usado") err(RUTA_REGISTRO, `${k}.pack`, `"${a.id}": el pack "${a.pack}" está ${pack.estado}, no usado`);
      if (!a.id.startsWith(`${a.pack}/`)) err(RUTA_REGISTRO, `${k}.id`, `"${a.id}" no empieza con su pack "${a.pack}/"`);
      if (servidos && !servidos.has(a.archivo)) err(RUTA_REGISTRO, `${k}.archivo`, `"${a.id}" nombra "${a.archivo}", que no existe`);
      if (a.atribucion_requerida && !(c.creditos?.data.atribuciones ?? []).some((x) => x.pack === a.pack)) {
        err(RUTA_REGISTRO, `${k}.atribucion_requerida`, `"${a.id}" pide atribución y el pack "${a.pack}" no aparece en ${RUTA_CREDITOS}`);
      }
    });
  }

  // Third-party code (D-831): same closed list; a file registered twice is an error.
  const codigo = c.registroCodigo?.data.codigo ?? [];
  const vistosCodigo = new Set<string>();
  codigo.forEach((x, i) => {
    const k = `codigo[${i}]`;
    if (vistosCodigo.has(x.archivo)) err(RUTA_CODIGO, `${k}.archivo`, `"${x.archivo}" registrado dos veces`);
    vistosCodigo.add(x.archivo);
    if (!licenciaPermitida(x.licencia)) err(RUTA_CODIGO, `${k}.licencia`, `"${x.id}" tiene licencia "${x.licencia}", ${FUERA_DE_LISTA}`);
  });
  for (const [paquete, o] of Object.entries(c.overridesNpm?.data.overrides ?? {})) {
    if (!licenciaPermitida(o.license)) err("content/npm-licence-overrides.yaml", `overrides.${paquete}.license`, `"${paquete}" tiene licencia "${o.license}", ${FUERA_DE_LISTA}`);
  }

  for (const { archivo, data: d } of c.dioramas) {
    (d.props ?? []).forEach((p, i) => {
      if (!p.asset.startsWith(PREFIJO_MODELO)) return;
      const k = `props[${i}].asset`;
      const fila = porId.get(p.asset.slice(PREFIJO_MODELO.length));
      if (!fila) {
        err(archivo, k, `"${p.asset}" no tiene registro en ${RUTA_REGISTRO}`);
        return;
      }
      if (fila.archivo !== archivoDeModelo(p.asset)) err(archivo, k, `"${p.asset}" se sirve desde ${archivoDeModelo(p.asset)}, pero el registro dice ${fila.archivo}`);
      if (!p.tam) err(archivo, `props[${i}].tam`, `"${p.asset}" necesita tam (la huella que bloquea la grilla y la caja donde entra el modelo)`);
    });
  }
};
