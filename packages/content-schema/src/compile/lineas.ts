// Walks the set and extracts every text the game says or shows, with who says it, in which language
// and in which band. The lints (lints.ts) run over this list: a single walk for all of them.
import { Banda, esLineaLumi } from "../schemas/common.ts";
import type { LineaGuionada } from "../schemas/common.ts";
import type { Escena } from "../schemas/mision.ts";
import type { Conjunto } from "./conjunto.ts";

export interface Linea {
  /** Stable id of the line (used by content/lint-allowlist.yaml). */
  id: string;
  archivo: string;
  clave: string;
  texto: string;
  /** NPC-*, LUMI or null (world texts: envelopes, notebook explanations). */
  quien: string | null;
  idioma: "en" | "es";
  /** CEFR band of the line; null if the length lint does not apply. */
  banda: string | null;
  escena: Escena | null;
}

const lineasDeBloque = (
  out: Linea[], archivo: string, base: string, idBase: string, lineas: readonly LineaGuionada[], escena: Escena,
): void => {
  lineas.forEach((l, i) => {
    if (esLineaLumi(l)) return; // templates are linted once, from the catalog
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
  // Signature phrases: L2 lines the NPC says verbatim. Band = the lowest of bandas_mcer.region_1
  // ("A0-A1" -> A0): the phrase is heard from the NPC's first scene, so the strictest cap applies.
  const bandaDeNpc = new Map(c.npcs.map(({ data: n }) => [n.id as string, Banda.safeParse(n.bandas_mcer.region_1.split("-")[0]).data ?? null]));
  const conBase = (base: string, k: string): string => (base ? `${base}.${k}` : k);
  for (const { archivo, base, data: n } of c.npcs) {
    n.frases_firma.forEach((f, i) => out.push({
      id: `${n.id}.frase_firma.${i}`, archivo, clave: conBase(base, `frases_firma[${i}]`), texto: f,
      quien: n.id, idioma: "en", banda: bandaDeNpc.get(n.id) ?? null, escena: null,
    }));
  }
  // uso_en_mundo is a description in Spanish; what the game says are the quotes in quotation marks.
  // The schema has no speaker per entry: the sheet's only NPC is propuesta_por (creditos may
  // include "jugador"), and in 02 the usage quotes are the reaction of whoever proposed the site
  // (SITIO-PARADA: Ollie, "Now somebody waits for me!"). They are attributed to propuesta_por, with its band.
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
