// Cross-checks (03 §6.1 validations 1, 2, 6; 04 F1.2: mission→NPC, scene→place, criteria→HAB-*,
// effects→SITIO-*/NPC-*, knowledge items→SAB-*, reachable network; 02 §2.7.1 and §6.6 #14).
import { esLineaLumi } from "../schemas/common.ts";
import type { LineaGuionada } from "../schemas/common.ts";
import type { Conjunto } from "./conjunto.ts";
import type { Hallazgo } from "./tipos.ts";

type Reportar = (archivo: string, clave: string, regla: string, mensaje: string) => void;

const unir = (base: string, clave: string): string => (base ? `${base}.${clave}` : clave);

export const chequearReferencias = (c: Conjunto, h: Hallazgo[]): void => {
  const err: Reportar = (archivo, clave, regla, mensaje) => h.push({ nivel: "error", archivo, clave, regla, mensaje });

  const misiones = new Set(c.misiones.map((m) => m.data.id));
  const fichas = new Map(c.npcs.map((n) => [n.data.id, n.data]));
  const elenco = new Set([...fichas.keys(), ...c.regiones.flatMap((r) => r.data.elenco)]);
  const saberes = new Map(c.saberes.map((s) => [s.data.id, s.data]));
  const saberesDeclarados = new Set([...saberes.keys(), ...c.regiones.flatMap((r) => r.data.saberes)]);
  const hechos = new Set(c.saberes.flatMap((s) => s.data.hechos.map((x) => x.id)));
  const lugares = new Map(c.lugares.map((l) => [l.data.id, l.data]));
  const habilidades = new Set(c.habilidades.map((x) => x.data.id));
  const sitios = new Set(c.fundaciones.map((f) => f.data.id));
  const plantillas = new Set(c.plantillas.map((p) => p.data.id));
  const pistas = new Set(c.pistas.map((p) => p.data.id));
  const aristas = new Set(c.presentaciones.map((p) => p.data.id));
  const regiones = new Set(c.regiones.map((r) => r.data.id));
  const vedados = new Set((c.temas?.vedados ?? []).map((t) => t.toLowerCase()));

  const existe = (conj: { has(id: string): boolean }, que: string) =>
    (archivo: string, clave: string, id: string | null | undefined): void => {
      if (id != null && !conj.has(id)) err(archivo, clave, "referencia", `${que} "${id}" no existe`);
    };
  const npcConFicha = existe(fichas, "NPC (sin ficha en content/npcs/)");
  const npcDelElenco = existe(elenco, "NPC (ni ficha ni elenco de la región)");
  const lugar = existe(lugares, "lugar (content/world/places.yaml)");
  const habilidad = existe(habilidades, "habilidad (content/skills/skill-tree.yaml)");
  const sitio = existe(sitios, "sitio de fundación (content/fundaciones/)");
  const saber = existe(saberes, "saber (content/saberes/)");
  const plantilla = existe(plantillas, "plantilla de Lumi (content/companion/lumi.es-AR.yaml)");
  const mision = existe(misiones, "misión");

  const lineas = (archivo: string, base: string, ls: readonly LineaGuionada[]) =>
    ls.forEach((l, i) => (esLineaLumi(l) ? plantilla(archivo, `${base}[${i}].plantilla`, l.plantilla) : npcConFicha(archivo, `${base}[${i}].quien`, l.quien)));

  // Region: every NPC sheet is in the declared cast.
  for (const n of c.npcs) {
    if (!c.regiones.some((r) => r.data.elenco.includes(n.data.id))) err(n.archivo, "id", "referencia", `"${n.data.id}" no está en el elenco de ninguna región (content/world/places.yaml)`);
  }

  for (const { archivo, data: m } of c.misiones) {
    if (!regiones.has(m.region)) err(archivo, "region", "referencia", `región "${m.region}" no existe`);
    m.npcs.forEach((id, i) => npcConFicha(archivo, `npcs[${i}]`, id));
    m.requiere.forEach((r, i) => {
      const k = `requiere[${i}]`;
      if (r.startsWith("HAB-")) habilidad(archivo, k, r);
      else if (r.startsWith("intro:")) {
        const npc = r.slice("intro:".length);
        if (!c.presentaciones.some((p) => p.data.npc === npc)) err(archivo, k, "referencia", `no hay presentación (content/red/presentaciones.yaml) que lleve a ${npc}`);
      } else mision(archivo, k, r);
    });
    m.red.altas.forEach((a, i) => { npcDelElenco(archivo, `red.altas[${i}].npc`, a.npc); npcDelElenco(archivo, `red.altas[${i}].por`, a.por); });
    m.red.presenta.forEach((p, i) => { npcDelElenco(archivo, `red.presenta[${i}].npc`, p.npc); npcDelElenco(archivo, `red.presenta[${i}].por`, p.por); });
    m.red.nombra.forEach((id, i) => npcDelElenco(archivo, `red.nombra[${i}]`, id));
    m.saberes.forEach((s, i) => saber(archivo, `saberes[${i}].saber`, s.saber));
    m.hechos_verificables.forEach((hv, i) => { if (!hechos.has(hv)) err(archivo, `hechos_verificables[${i}]`, "referencia", `hecho "${hv}" no está en ninguna ficha SAB-*`); });
    if ("plantilla" in m.pre_tarea) plantilla(archivo, "pre_tarea.plantilla", m.pre_tarea.plantilla);
    m.desbloqueos.forEach((d, i) => habilidad(archivo, `desbloqueos[${i}].habilidad`, d.habilidad));
    m.mundo.forEach((ev, i) => {
      const [tipo, valor] = ev.split(":");
      if (tipo === "saber") saber(archivo, `mundo[${i}]`, valor);
      if (tipo === "net_add" || tipo === "known") npcDelElenco(archivo, `mundo[${i}]`, valor);
    });

    const efectos = (base: string, lista: typeof m.efectos) => lista.forEach((e, i) => {
      const k = unir(base, `efectos[${i}]`);
      if ("fundacion" in e) sitio(archivo, `${k}.fundacion`, e.fundacion);
      if ("intro" in e) {
        npcDelElenco(archivo, `${k}.intro`, e.intro);
        if (!c.presentaciones.some((p) => p.data.npc === e.intro && p.data.mision === m.id)) {
          err(archivo, `${k}.intro`, "referencia", `el efecto intro:${e.intro} no tiene arista en content/red/presentaciones.yaml con mision ${m.id}`);
        }
      }
    });
    efectos("", m.efectos);

    const escenas = new Set<string>();
    m.escenas.forEach((e, ei) => {
      const b = `escenas[${ei}]`;
      if (!e.escena_id.startsWith(`${m.id}-E`)) err(archivo, `${b}.escena_id`, "id", `la escena "${e.escena_id}" no pertenece a ${m.id}`);
      if (escenas.has(e.escena_id)) err(archivo, `${b}.escena_id`, "id-unico", `escena "${e.escena_id}" duplicada`);
      escenas.add(e.escena_id);
      npcConFicha(archivo, `${b}.npc`, e.npc);
      lugar(archivo, `${b}.lugar`, e.lugar);
      const ficha = e.npc ? fichas.get(e.npc) : undefined;
      // Minors in scene: public places only (01 §2.17.1; the rule is triggered by the es_menor field).
      if (ficha?.es_menor && lugares.get(e.lugar)?.publico === false) {
        err(archivo, `${b}.lugar`, "seguridad", `${e.npc} es menor: la escena tiene que ser en un lugar público`);
      }
      e.hechos_escena.forEach((s, i) => {
        saber(archivo, `${b}.hechos_escena[${i}]`, s);
        if (ficha && !ficha.hechos_que_puede_decir.includes(s)) err(archivo, `${b}.hechos_escena[${i}]`, "saberes", `${s} no está en hechos_que_puede_decir de ${e.npc} (regla K1; 02 §6.6 #14)`);
      });
      if (Array.isArray(e.apertura_guionada)) lineas(archivo, `${b}.apertura_guionada`, e.apertura_guionada);
      lineas(archivo, `${b}.cierre_guionado`, e.cierre_guionado);
      if (e.lineas_guionadas) lineas(archivo, `${b}.lineas_guionadas`, e.lineas_guionadas);
      if ("lineas" in e.salida_si_no_converge) lineas(archivo, `${b}.salida_si_no_converge.lineas`, e.salida_si_no_converge.lineas);
      if (Array.isArray(e.ramas)) e.ramas.forEach((r, i) => { npcConFicha(archivo, `${b}.ramas[${i}].quien`, r.quien); plantilla(archivo, `${b}.ramas[${i}].lumi`, r.lumi); });
      e.criterios_exito.forEach((cr, i) => habilidad(archivo, `${b}.criterios_exito[${i}].habilidad`, cr.habilidad));
      e.pronunciacion.forEach((p, i) => {
        if (!p.momento_id.startsWith(`${e.escena_id}-PRON-`)) err(archivo, `${b}.pronunciacion[${i}].momento_id`, "id", `el momento no pertenece a ${e.escena_id}`);
        plantilla(archivo, `${b}.pronunciacion[${i}].plantilla`, p.plantilla);
      });
      e.temas_permitidos.forEach((t, i) => {
        if (vedados.has(t.toLowerCase())) err(archivo, `${b}.temas_permitidos[${i}]`, "seguridad", `"${t}" está en la lista global de temas vedados (content/safety/topics.global.yaml)`);
      });
      efectos(b, e.efectos);
      if (e.conversacion !== undefined) {
        const ficha = c.conversaciones.find((x) => x.data.id === e.conversacion);
        if (!ficha) err(archivo, `${b}.conversacion`, "referencia", `ficha de conversación "${e.conversacion}" no existe (content/conversaciones/)`);
        else if (ficha.data.npc !== e.npc) err(archivo, `${b}.conversacion`, "referencia", `la ficha ${e.conversacion} es de ${ficha.data.npc}, no de ${e.npc ?? "una escena sin NPC"}`);
      }
    });
  }

  for (const { archivo, data: f } of c.conversaciones) npcConFicha(archivo, "npc", f.npc);

  for (const { archivo, data: n } of c.npcs) {
    lugar(archivo, "lugar", n.lugar);
    n.presentado_por.forEach((id, i) => npcDelElenco(archivo, `presentado_por[${i}]`, id));
    n.presenta_a.forEach((id, i) => npcDelElenco(archivo, `presenta_a[${i}]`, id));
    Object.keys(n.relaciones).forEach((id) => npcDelElenco(archivo, `relaciones.${id}`, id));
    Object.entries(n.quien_sabe_mas).forEach(([tema, id]) => npcDelElenco(archivo, `quien_sabe_mas.${tema}`, id));
    n.hechos_que_puede_decir.forEach((s, i) => { if (!saberesDeclarados.has(s)) err(archivo, `hechos_que_puede_decir[${i}]`, "referencia", `saber "${s}" no existe ni está declarado en la región`); });
    n.pistas_misterio.forEach((p, i) => { if (!pistas.has(p)) err(archivo, `pistas_misterio[${i}]`, "referencia", `pista "${p}" no existe (content/mystery/clues.yaml)`); });
  }

  for (const { archivo, data: s } of c.saberes) {
    mision(archivo, "mision", s.mision);
    if (s.dicho_por !== "LUMI") npcConFicha(archivo, "dicho_por", s.dicho_por);
    plantilla(archivo, "plantilla", s.plantilla);
  }

  for (const { archivo, base, data: p } of c.plantillas) {
    saber(archivo, `${base}.saber`, p.saber);
    mision(archivo, `${base}.mision`, p.mision);
  }

  for (const { archivo, data: f } of c.fundaciones) {
    lugar(archivo, "lugar", f.lugar);
    npcDelElenco(archivo, "propuesta_por", f.propuesta_por);
    f.creditos.forEach((id, i) => { if (id !== "jugador") npcDelElenco(archivo, `creditos[${i}]`, id); });
  }

  for (const { archivo, base, data: p } of c.presentaciones) {
    npcDelElenco(archivo, `${base}.npc`, p.npc);
    npcDelElenco(archivo, `${base}.presentado_por`, p.presentado_por);
    mision(archivo, `${base}.mision`, p.mision);
    p.caminos_alternativos.forEach((id, i) => { if (!aristas.has(id)) err(archivo, `${base}.caminos_alternativos[${i}]`, "referencia", `presentación "${id}" no existe`); });
    const ficha = fichas.get(p.npc);
    if (ficha && !ficha.presentado_por.includes(p.presentado_por)) {
      err(archivo, `${base}.presentado_por`, "red", `${p.presentado_por} no figura en presentado_por de la ficha de ${p.npc}`);
    }
  }

  for (const { archivo, base, data: s } of c.sobres) { lugar(archivo, `${base}.aparece.lugar`, s.aparece.lugar); mision(archivo, `${base}.aparece.tras`, s.aparece.tras); }
  for (const { archivo, base, data: p } of c.pistas) { npcDelElenco(archivo, `${base}.npc`, p.npc); habilidad(archivo, `${base}.requiere`, p.requiere); }
  for (const { archivo, base, data: e } of c.glosario) e.usado_en.forEach((m, i) => mision(archivo, `${base}.usado_en[${i}]`, m));

  // Dioramas (03 §6.4.3): anchors ↔ sheets, only for dioramas that already exist (F2/F3 create them).
  for (const { archivo, data: d } of c.dioramas) {
    d.sitios.forEach((s, i) => sitio(archivo, `sitios[${i}].id`, s.id));
    (d.npcs ?? []).forEach((n, i) => npcConFicha(archivo, `npcs[${i}].id`, n.id));
    for (const f of c.fundaciones) {
      if (f.data.diorama === d.id && !d.sitios.some((s) => s.id === f.data.id)) err(f.archivo, "diorama", "referencia", `${f.data.id} no tiene ancla en sitios: de ${archivo}`);
    }
  }
  for (const { archivo, base, data: l } of c.lugares) {
    if (!regiones.has(l.region)) err(archivo, `${base}.region`, "referencia", `región "${l.region}" no existe`);
  }
};

/** A4 (04 F1.2): from the start, every NPC with requiere_presentacion has a path of introductions. */
export const chequearRed = (c: Conjunto, h: Hallazgo[]): void => {
  const alcanzados = new Set(c.npcs.filter((n) => !n.data.requiere_presentacion).map((n) => n.data.id));
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const { data: p } of c.presentaciones) {
      if (alcanzados.has(p.presentado_por) && !alcanzados.has(p.npc)) {
        alcanzados.add(p.npc);
        cambio = true;
      }
    }
  }
  for (const { archivo, data: n } of c.npcs) {
    if (n.requiere_presentacion && !alcanzados.has(n.id)) {
      h.push({ nivel: "error", archivo, clave: "requiere_presentacion", regla: "red", mensaje: `${n.id} requiere presentación y ninguna cadena de content/red/presentaciones.yaml lo alcanza desde el inicio` });
    }
  }
};

/** Lumi catalog (02 §2.7.1): for A0 and A1 there is a generic signal (type any) per step 2-5. */
export const chequearCatalogoLumi = (c: Conjunto, h: Hallazgo[]): void => {
  const archivo = c.plantillas[0]?.archivo;
  if (!archivo) return;
  for (const banda of ["A0", "A1"] as const) {
    for (const escalon of [2, 3, 4, 5]) {
      const hay = c.plantillas.some(({ data: p }) => p.funcion === "senal" && p.escalon === escalon && p.bandas.includes(banda) && (p.tipo_error ?? []).includes("any"));
      if (!hay) h.push({ nivel: "error", archivo, clave: "plantillas", regla: "lumi", mensaje: `falta una señal genérica (tipo any) de escalón ${escalon} para ${banda}` });
    }
  }
};

/** Level cards for each band a scene uses. */
export const chequearNiveles = (c: Conjunto, h: Hallazgo[]): void => {
  const hay = new Set<string>(c.niveles.map((n) => n.data.banda));
  for (const { archivo, data: m } of c.misiones) {
    m.escenas.forEach((e, i) => {
      if (!hay.has(e.banda)) h.push({ nivel: "error", archivo, clave: `escenas[${i}].banda`, regla: "referencia", mensaje: `no hay tarjeta de nivel para ${e.banda} (content/level-cards/)` });
    });
  }
};
