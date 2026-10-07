// Recorre el conjunto y saca cada texto que el juego dice o muestra, con quién lo dice, en qué idioma
// y en qué banda. Los lints (lints.ts) corren sobre esta lista: un solo recorrido para todos.
import { Banda, esLineaLumi } from "../schemas/common.ts";
import type { LineaGuionada } from "../schemas/common.ts";
import type { Escena } from "../schemas/mision.ts";
import type { Conjunto } from "./conjunto.ts";

export interface Linea {
  /** Id estable de la línea (lo usa content/lint-allowlist.yaml). */
  id: string;
  archivo: string;
  clave: string;
  texto: string;
  /** NPC-*, LUMI o null (textos del mundo: sobres, explicaciones del cuaderno). */
  quien: string | null;
  idioma: "en" | "es";
  /** Banda MCER de la línea; null si no aplica el lint de longitud. */
  banda: string | null;
  escena: Escena | null;
}

const lineasDeBloque = (
  out: Linea[], archivo: string, base: string, idBase: string, lineas: readonly LineaGuionada[], escena: Escena,
): void => {
  lineas.forEach((l, i) => {
    if (esLineaLumi(l)) return; // las plantillas se lintean una vez, desde el catálogo
    out.push({
      id: `${idBase}.${i}`, archivo, clave: `${base}[${i}].en`, texto: l.en,
      quien: l.quien, idioma: "en", banda: escena.banda, escena,
    });
  });
};

export const extraerLineas = (c: Conjunto): Linea[] => {
  const out: Linea[] = [];
  for (const { archivo, data: m } of c.misiones) {
    m.escenas.forEach((e, ei) => {
      const b = `escenas[${ei}]`;
      const id = e.escena_id;
      if (Array.isArray(e.apertura_guionada)) lineasDeBloque(out, archivo, `${b}.apertura_guionada`, `${id}.apertura`, e.apertura_guionada, e);
      lineasDeBloque(out, archivo, `${b}.cierre_guionado`, `${id}.cierre`, e.cierre_guionado, e);
      if (e.lineas_guionadas) lineasDeBloque(out, archivo, `${b}.lineas_guionadas`, `${id}.lineas`, e.lineas_guionadas, e);
      if ("lineas" in e.salida_si_no_converge) {
        lineasDeBloque(out, archivo, `${b}.salida_si_no_converge.lineas`, `${id}.salida`, e.salida_si_no_converge.lineas, e);
      }
      if (Array.isArray(e.ramas)) {
        e.ramas.forEach((r, ri) => {
          if (r.npc === null) return;
          out.push({
            id: `${id}.rama.${ri}`, archivo, clave: `${b}.ramas[${ri}].npc`, texto: r.npc,
            quien: r.quien, idioma: "en", banda: e.banda, escena: e,
          });
        });
      }
    });
  }
  const bandaDeMision = new Map(c.misiones.map((m) => [m.data.id, m.data.mcer]));
  for (const { archivo, data: s } of c.saberes) {
    const banda = bandaDeMision.get(s.mision) ?? null;
    const habla = s.dicho_por === "LUMI" ? "LUMI" : s.dicho_por;
    const idiomaLinea = s.dicho_por === "LUMI" ? "es" : "en";
    if (s.linea_en !== null) out.push({ id: `${s.id}.linea_en`, archivo, clave: "linea_en", texto: s.linea_en, quien: habla, idioma: "en", banda, escena: null });
    out.push({ id: `${s.id}.linea_sin_dato`, archivo, clave: "linea_sin_dato", texto: s.linea_sin_dato, quien: habla, idioma: idiomaLinea, banda: idiomaLinea === "en" ? banda : null, escena: null });
    out.push({ id: `${s.id}.explicacion_es`, archivo, clave: "explicacion_es", texto: s.explicacion_es, quien: null, idioma: "es", banda: null, escena: null });
    s.hechos.forEach((hv, i) => out.push({ id: `${hv.id}`, archivo, clave: `hechos[${i}].texto_es`, texto: hv.texto_es, quien: null, idioma: "es", banda: null, escena: null }));
  }
  for (const { archivo, base, data: s } of c.sobres) {
    out.push({ id: `${s.id}.texto_en`, archivo, clave: `${base}.texto_en`, texto: s.texto_en, quien: null, idioma: "en", banda: s.banda_lectura, escena: null });
  }
  for (const { archivo, base, data: p } of c.pistas) {
    out.push({ id: p.id, archivo, clave: `${base}.linea_en`, texto: p.linea_en, quien: p.npc, idioma: "en", banda: p.banda, escena: null });
  }
  for (const { archivo, base, data: p } of c.presentaciones) {
    const banda = bandaDeMision.get(p.mision) ?? null;
    out.push({ id: `${p.id}.presentador`, archivo, clave: `${base}.linea_presentador_en`, texto: p.linea_presentador_en, quien: p.presentado_por, idioma: "en", banda, escena: null });
    if (p.linea_reconocimiento_en !== null) {
      out.push({ id: `${p.id}.reconocimiento`, archivo, clave: `${base}.linea_reconocimiento_en`, texto: p.linea_reconocimiento_en, quien: p.npc, idioma: "en", banda, escena: null });
    }
  }
  // Frases firma: líneas en L2 que el NPC dice tal cual. Banda = la más baja de bandas_mcer.region_1
  // ("A0-A1" -> A0): la frase se oye desde la primera escena del NPC, así que rige el tope más estricto.
  const bandaDeNpc = new Map(c.npcs.map(({ data: n }) => [n.id as string, Banda.safeParse(n.bandas_mcer.region_1.split("-")[0]).data ?? null]));
  const conBase = (base: string, k: string): string => (base ? `${base}.${k}` : k);
  for (const { archivo, base, data: n } of c.npcs) {
    n.frases_firma.forEach((f, i) => out.push({
      id: `${n.id}.frase_firma.${i}`, archivo, clave: conBase(base, `frases_firma[${i}]`), texto: f,
      quien: n.id, idioma: "en", banda: bandaDeNpc.get(n.id) ?? null, escena: null,
    }));
  }
  // uso_en_mundo es una descripción en español; lo que el juego dice son las citas entre comillas.
  // El esquema no tiene hablante por entrada: el único NPC de la ficha es propuesta_por (creditos puede
  // incluir "jugador"), y en 02 las citas de uso son la reacción de quien propuso el sitio
  // (SITIO-PARADA: Ollie, "Now somebody waits for me!"). Se atribuyen a propuesta_por, con su banda.
  for (const { archivo, base, data: f } of c.fundaciones) {
    f.uso_en_mundo.forEach((u, i) => {
      [...u.matchAll(/"([^"]+)"|“([^”]+)”/gu)].forEach((m, j) => out.push({
        id: `${f.id}.uso.${i}.${j}`, archivo, clave: conBase(base, `uso_en_mundo[${i}]`), texto: m[1] ?? m[2] ?? "",
        quien: f.propuesta_por, idioma: "en", banda: bandaDeNpc.get(f.propuesta_por) ?? null, escena: null,
      }));
    });
  }
  for (const { archivo, base, data: p } of c.plantillas) {
    out.push({ id: p.id, archivo, clave: `${base}.texto`, texto: p.texto, quien: "LUMI", idioma: "es", banda: null, escena: null });
  }
  return out;
};
