// Compiled output (03 §6.1, D-159): the server receives everything; the client only what it can see, and never
// prompts, personas, level cards, model situations, hints or design glosses.
// Per-mode filters (03 §8.3): glossary as D-067/D-128, knowledge items as D-170.
import { esLineaLumi } from "../schemas/common.ts";
import type { LineaGuionada } from "../schemas/common.ts";
import type { EntradaGlosario } from "../schemas/aprendizaje.ts";
import type { Escena, Mision } from "../schemas/mision.ts";
import type { Saber } from "../schemas/saber.ts";
import type { Conjunto } from "./conjunto.ts";
import type { Modo } from "./tipos.ts";

/** Glossary by mode: dev = everything (the UI marks "borrador", D-131); fv = approved + reviewed (D-128); release = approved. */
export const filtrarGlosario = (entradas: readonly EntradaGlosario[], modo: Modo): EntradaGlosario[] =>
  entradas.filter((e) => modo === "dev" || e.estado === "approved" || (modo === "fv" && e.estado === "reviewed"));

/** Knowledge items by mode (D-170): dev = everything (marked "sin verificar"); fv and release = verified or reviewed. */
export const filtrarSaberes = (saberes: readonly Saber[], modo: Modo): Saber[] =>
  saberes.filter((s) => modo === "dev" || s.estado !== "sin_verificar");

const lineaCliente = (l: LineaGuionada) => (esLineaLumi(l) ? { quien: l.quien, plantilla: l.plantilla } : { quien: l.quien, en: l.en, audio: l.audio });

const escenaCliente = (e: Escena) => ({
  escena_id: e.escena_id,
  npc: e.npc,
  lugar: e.lugar,
  hora: e.hora,
  banda: e.banda,
  apertura_guionada: Array.isArray(e.apertura_guionada) ? e.apertura_guionada.map(lineaCliente) : [],
  lineas_guionadas: (e.lineas_guionadas ?? []).map(lineaCliente),
  cierre_guionado: e.cierre_guionado.map(lineaCliente),
  salida_si_no_converge: "lineas" in e.salida_si_no_converge ? e.salida_si_no_converge.lineas.map(lineaCliente) : [],
  efectos: e.efectos,
  pronunciacion: e.pronunciacion.map(({ nota, ...p }) => { void nota; return p; }), // the note is the author's, it does not travel to the client
});

const misionCliente = (m: Mision) => ({
  id: m.id, titulo: m.titulo, capitulo: m.capitulo, region: m.region, mcer: m.mcer, can_do: m.can_do,
  requiere: m.requiere, npcs: m.npcs, efectos: m.efectos, saberes: m.saberes,
  escenas: m.escenas.map(escenaCliente), duracion_objetivo_min: m.duracion_objetivo_min, estado: m.estado,
});

export type Salida = Record<string, unknown>;

/** File → content for apps/server/generated/content/ (everything, filtered by mode). */
export const vistaServidor = (c: Conjunto, modo: Modo): Salida => ({
  "misiones.json": c.misiones.map((m) => m.data),
  "npcs.json": c.npcs.map((n) => n.data),
  "pedidos.json": c.pedidos.map((p) => p.data),
  "fundaciones.json": c.fundaciones.map((f) => f.data),
  // The server needs all the sheets: if one is not visible in the mode, the NPC says linea_sin_dato (D-170).
  "saberes.json": c.saberes.map(({ data: s }) => ({ ...s, visible_en_modo: filtrarSaberes([s], modo).length > 0 })),
  "red.json": c.presentaciones.map((p) => p.data),
  "sobres.json": c.sobres.map((s) => s.data),
  "pistas.json": c.pistas.map((p) => p.data),
  "lumi.json": c.plantillas.map((p) => p.data),
  "glosario.json": filtrarGlosario(c.glosario.map((g) => g.data), modo),
  "habilidades.json": { ramas: c.ramas, habilidades: c.habilidades.map((x) => x.data) },
  "lugares.json": { regiones: c.regiones.map((r) => r.data), lugares: c.lugares.map((l) => l.data) },
  "niveles.json": c.niveles.map((n) => n.data),
  "dioramas.json": c.dioramas.map((d) => d.data),
  "prompts.json": c.prompts,
  // ADR-027: conversation sheets (persona, facts, goal): server only; the HUD receives the labels through the protocol.
  "conversaciones.json": c.conversaciones.map((f) => f.data),
  // F4.2: the lists also moderate at runtime (player input and NPC output) and containment (D-112).
  "seguridad.json": { temas: c.temas, listas: c.bloqueos.map((b) => b.data), contencion: c.contencion },
});

/** File → content for apps/web/public/content/ (only what is visible; dev marks states for the UI). */
export const vistaCliente = (c: Conjunto, modo: Modo): Salida => ({
  "misiones.json": c.misiones.map((m) => misionCliente(m.data)),
  "npcs.json": c.npcs.map(({ data: n }) => ({
    id: n.id, nombre: n.nombre, rol: n.rol, lugar: n.lugar, es_menor: n.es_menor,
    requiere_presentacion: n.requiere_presentacion, presentado_por: n.presentado_por,
    // Plan estetica-c M5: world/ draws each neighbor with its appearance (null if the sheet does not carry it yet).
    apariencia: n.apariencia ?? null,
  })),
  "fundaciones.json": c.fundaciones.map((f) => f.data),
  "saberes.json": filtrarSaberes(c.saberes.map((s) => s.data), modo).map((s) => ({
    id: s.id, titulo_corto: s.titulo_corto, explicacion_es: s.explicacion_es, estado: s.estado,
    dicho_por: s.dicho_por, mision: s.mision, rama: s.rama, ficcion: s.ficcion,
    hechos: s.hechos.map((x) => x.id),
  })),
  "red.json": c.presentaciones.map((p) => p.data),
  "sobres.json": c.sobres.map(({ data: s }) => ({ id: s.id, aparece: s.aparece, texto_en: s.texto_en, lectura_en_voz_alta: s.lectura_en_voz_alta, banda_lectura: s.banda_lectura })),
  "lumi.json": c.plantillas.map(({ data: p }) => ({
    id: p.id, funcion: p.funcion, escalon: p.escalon, modos: p.modos, bandas: p.bandas, tipo_error: p.tipo_error,
    texto: p.texto, slots: p.slots, audio: p.audio, mision: p.mision, saber: p.saber, estado: p.estado,
  })),
  "glosario.json": filtrarGlosario(c.glosario.map((g) => g.data), modo),
  "habilidades.json": { ramas: c.ramas, habilidades: c.habilidades.map((x) => x.data) },
  "lugares.json": { regiones: c.regiones.map(({ data: r }) => ({ id: r.id, nombre: r.nombre, dioramas: r.dioramas })), lugares: c.lugares.map((l) => l.data) },
  // F4.2: which glossary states the HUD shows (03 §8.3, D-131): the value is the compilation mode.
  "manifiesto.json": { glossaryDisplay: modo },
  // F2: the map needs the whole layout (diorama ground, volumes, NPCs, non-walkable zones); it carries nothing of design.
  "dioramas.json": c.dioramas.map((d) => d.data),
  // Plan estetica-c M2 (03 §6.4.2): what the credits screen shows (the registry's mandatory attributions).
  "creditos.json": { atribuciones: c.creditos?.data.atribuciones ?? [] },
});
