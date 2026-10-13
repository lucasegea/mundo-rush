// Chequeos del registro de licencias de assets (03 §6.4.2, D-153; plan estetica-c M2). Puro: la lista de archivos
// servidos llega como dato (la arma scripts/content/build.ts). Falla el build si un archivo servido no tiene registro, si
// una licencia es no comercial o de uso personal, si un registro con atribución obligatoria no está en los créditos, o si
// un diorama usa un `modelo/*` sin registro.
import { archivoDeModelo, CARPETAS_CON_REGISTRO, LICENCIA_PROHIBIDA, PREFIJO_MODELO } from "../schemas/assets.ts";
import type { Conjunto } from "./conjunto.ts";
import type { Hallazgo } from "./tipos.ts";

const RUTA_REGISTRO = "content/assets-registry.yaml";
const RUTA_CREDITOS = "content/creditos.yaml";

/** ¿Este archivo servido necesita registro? (models, textures, audio, sprites; 03 §6.4.2). */
export const necesitaRegistro = (ruta: string): boolean => CARPETAS_CON_REGISTRO.some((c) => ruta.startsWith(c));

/**
 * `publicos`: rutas desde la raíz del repo de los archivos servidos en apps/web/public (sin el contenido generado).
 * Sin la lista (tests del compilador con contenido sintético) se saltean solo los cruces contra disco.
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
      if (LICENCIA_PROHIBIDA.test(p.licencia) && p.estado === "usado") {
        err(RUTA_REGISTRO, `packs[${i}].licencia`, `el pack "${p.id}" tiene licencia "${p.licencia}": no comercial o de uso personal no se puede usar (D-153)`);
      }
    });
    const vistos = new Set<string>();
    filas.forEach((a, i) => {
      const k = `assets[${i}]`;
      if (vistos.has(a.archivo)) err(RUTA_REGISTRO, `${k}.archivo`, `"${a.archivo}" registrado dos veces`);
      vistos.add(a.archivo);
      if (LICENCIA_PROHIBIDA.test(a.licencia)) {
        err(RUTA_REGISTRO, `${k}.licencia`, `"${a.id}" tiene licencia "${a.licencia}": no comercial o de uso personal no se puede usar (D-153)`);
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
