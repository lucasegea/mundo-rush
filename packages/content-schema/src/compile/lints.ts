// Lints de texto de validate:content (04 F1.2; 02 §1.5 reglas 3-4, §2.2, §3.3, §6.6 #3/#5/#6/#15-#17).
// Las listas viven en content/safety/blocklists/ y los topes en content/level-cards/: acá solo hay reglas.
import type { ListaBloqueo } from "../schemas/control.ts";
import type { Conjunto } from "./conjunto.ts";
import type { Linea } from "./lineas.ts";
import type { Hallazgo } from "./tipos.ts";

/** Límite de palabra Unicode (\b de JS no entiende "fácil"). `*` final = cualquier sufijo de letras. */
export const regexTermino = (termino: string, sinMayusculas: boolean): RegExp => {
  const comodin = termino.endsWith("*");
  const cuerpo = (comodin ? termino.slice(0, -1) : termino).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${cuerpo}${comodin ? "\\p{L}*" : ""}(?![\\p{L}\\p{N}_])`, sinMayusculas ? "iu" : "u");
};

/** Saca el marcado de inglés modelado (***…***) y los huecos {slot}: no son palabras del texto. */
const limpiar = (t: string): string => t.replace(/\*+/g, "").replace(/\{[a-z_0-9]+\}/g, " ");

/** "Dear X," como encabezado de carta en una escena de modo escritura (única excepción de apelativos). */
const esEncabezadoDeCarta = (l: Linea, termino: string): boolean =>
  termino.toLowerCase() === "dear" && l.escena?.modo_escritura === true && /^Dear\s+[^\s,]+(?:\s[^\s,]+)?,/.test(l.texto);

const aplica = (lista: ListaBloqueo, l: Linea): boolean => {
  if (l.quien !== null && lista.excepto.includes(l.quien)) return false;
  if (lista.aplica_a === "todo") return true;
  if (lista.aplica_a === "lumi") return l.quien === "LUMI" && l.idioma === "es";
  return l.idioma === "en";
};

export const lintBloqueos = (c: Conjunto, lineas: readonly Linea[], h: Hallazgo[]): void => {
  for (const { data: lista } of c.bloqueos) {
    const terminos = lista.terminos.map((t) => [t, regexTermino(t, lista.sin_mayusculas)] as const);
    for (const l of lineas) {
      if (!aplica(lista, l)) continue;
      const texto = limpiar(l.texto);
      for (const [t, re] of terminos) {
        if (re.test(texto) && !esEncabezadoDeCarta(l, t)) {
          h.push({ nivel: "error", archivo: l.archivo, clave: l.clave, regla: lista.regla, mensaje: `"${t}" (${lista.id}) en: "${l.texto}"` });
        }
      }
    }
  }
};

// ---------- Cifras (02 §1.5 regla 3, §6.6 #15) ----------

const HORA = /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)(?![\p{L}])|\b\d{1,2}:\d{2}\b/giu;
const UNIDADES = /\d\s*(?:%|m|km|cm|mm|kg|g|l|ml|ha|mi|ft|°)(?![\p{L}])|(?<![\p{L}])(?:percent|percentage|per\s+cent|por\s*ciento|meters?|metres?|kilometers?|kilometres?|miles|hectares?|liters?|litres?|metros?|kilómetros?|hectáreas?|litros?|times\s+more|veces\s+más)(?![\p{L}])/iu;

/** Una línea con dígitos, porcentajes o unidades falla, salvo horas y las cantidades listadas por la escena. */
export const encontrarCifra = (texto: string, permitidas: readonly string[] = []): string | null => {
  let t = limpiar(texto);
  for (const p of permitidas) t = t.split(p).join(" ");
  t = t.replace(HORA, " ");
  const unidad = UNIDADES.exec(t);
  if (unidad) return unidad[0].trim();
  const digito = /\p{Nd}+/u.exec(t);
  return digito ? digito[0] : null;
};

export const lintCifras = (lineas: readonly Linea[], h: Hallazgo[]): void => {
  for (const l of lineas) {
    const cifra = encontrarCifra(l.texto, l.escena?.cifras_permitidas ?? []);
    if (cifra !== null) {
      h.push({ nivel: "error", archivo: l.archivo, clave: l.clave, regla: "cifras", mensaje: `cifra "${cifra}" en: "${l.texto}" (02 §1.5 regla 3; si es una cantidad de objetos, listala en cifras_permitidas de la escena)` });
    }
  }
};

// ---------- Longitud por banda (02 §3.3, §6.6 #3) ----------

/** Oraciones de una línea: corta en . ! ? … y descarta vacías. */
export const oraciones = (texto: string): string[] =>
  limpiar(texto).split(/[.!?…]+/u).map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));

export const palabras = (oracion: string): number =>
  oracion.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export const lintLongitud = (c: Conjunto, lineas: readonly Linea[], h: Hallazgo[]): void => {
  const topes = new Map(c.niveles.map((n) => [n.data.banda as string, n.data]));
  const permitidas = new Map((c.allowlist?.data.longitud ?? []).map((a) => [a.linea, a]));
  const usadas = new Set<string>();
  for (const l of lineas) {
    if (l.idioma !== "en" || l.banda === null || l.quien === null || !l.quien.startsWith("NPC-")) continue;
    const tarjeta = topes.get(l.banda);
    if (!tarjeta) {
      h.push({ nivel: "error", archivo: l.archivo, clave: l.clave, regla: "longitud", mensaje: `no hay tarjeta de nivel para la banda ${l.banda} (content/level-cards/${l.banda}.yaml)` });
      continue;
    }
    const { min, max } = tarjeta.palabras_por_oracion;
    const ors = oraciones(l.texto);
    const larga = ors.find((o) => palabras(o) > max);
    if (larga !== undefined) {
      if (permitidas.has(l.id)) usadas.add(l.id);
      else h.push({ nivel: "error", archivo: l.archivo, clave: l.clave, regla: "longitud", mensaje: `oración de ${palabras(larga)} palabras (máximo ${max} en ${l.banda}): "${larga}" — línea ${l.id}; si es [GUIONADA] de 02, va a content/lint-allowlist.yaml` });
    }
    // Avisos (02 §6.6 #3): interjecciones y vocativos de 1-2 palabras quedan exentos del mínimo.
    const corta = ors.find((o) => palabras(o) > 2 && palabras(o) < min);
    if (corta !== undefined) h.push({ nivel: "aviso", archivo: l.archivo, clave: l.clave, regla: "longitud", mensaje: `oración de ${palabras(corta)} palabras bajo el mínimo ${min} de ${l.banda}: "${corta}"` });
    if (ors.filter((o) => palabras(o) > 2).length > tarjeta.oraciones_por_turno.max) {
      h.push({ nivel: "aviso", archivo: l.archivo, clave: l.clave, regla: "longitud", mensaje: `más de ${tarjeta.oraciones_por_turno.max} oraciones por turno en ${l.banda}` });
    }
  }
  // Una excepción que ya no corresponde a ninguna línea larga es basura que tapa regresiones.
  for (const [id, a] of permitidas) {
    if (!usadas.has(id) && c.allowlist) {
      const i = c.allowlist.data.longitud.indexOf(a);
      h.push({ nivel: "error", archivo: c.allowlist.archivo, clave: `longitud[${i}].linea`, regla: "longitud", mensaje: `la excepción "${id}" no corresponde a ninguna línea que supere el tope` });
    }
  }
};

/** Lumi: 6-14 palabras por oración y como mucho 2 oraciones (02 §2.7.1): solo aviso. */
export const lintLongitudLumi = (lineas: readonly Linea[], h: Hallazgo[]): void => {
  for (const l of lineas) {
    if (l.quien !== "LUMI" || l.idioma !== "es" || !l.clave.endsWith(".texto")) continue;
    const ors = oraciones(l.texto);
    const larga = ors.find((o) => palabras(o) > 14);
    if (larga !== undefined || ors.length > 2) {
      h.push({ nivel: "aviso", archivo: l.archivo, clave: l.clave, regla: "longitud-lumi", mensaje: `fuera de 6-14 palabras por oración o más de 2 oraciones: "${l.texto}"` });
    }
  }
};
