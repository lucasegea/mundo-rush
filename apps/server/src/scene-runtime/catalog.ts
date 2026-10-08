// Vista tipada del contenido compilado del servidor (apps/server/generated/content/, D-159). El compilador de F1.2 ya
// validó todo contra @lg/content-schema; acá solo se indexa. Los tipos vienen del esquema (import de tipos: en runtime
// el servidor no carga el compilador).
import type { ArchivoContencion, Escena, LineaGuionada, ListaBloqueo, Mision, Npc, Pista, Presentacion, Saber, TarjetaNivel } from "@lg/content-schema";
import type { ServerContent } from "../content/loader.ts";

export type ServerSaber = Saber & { visible_en_modo: boolean };

export interface Catalog {
  missions: Mision[];
  npc(id: string): Npc | undefined;
  mission(id: string): Mision | undefined;
  scene(missionId: string, sceneId: string): Escena | undefined;
  saber(id: string): ServerSaber | undefined;
  levelCard(band: string): TarjetaNivel | undefined;
  clue(id: string): Pista | undefined;
  /** Arista de la red que presenta a `npcId` (la primera; D-168). */
  introOf(npcId: string): Presentacion | undefined;
  npcBase: string;
  /** Listas de bloqueo (moderación en runtime, F4.2) y contención + línea segura (D-112). */
  safety: { lists: ListaBloqueo[]; containment: ArchivoContencion };
}

const arr = <T>(content: ServerContent, file: string): T[] => {
  const v = content[file];
  if (!Array.isArray(v)) throw new Error(`contenido compilado sin ${file}: corré npm run build:content`);
  return v as T[];
};

export function readCatalog(content: ServerContent): Catalog {
  const missions = arr<Mision>(content, "misiones.json");
  const npcs = arr<Npc>(content, "npcs.json");
  const saberes = arr<ServerSaber>(content, "saberes.json");
  const niveles = arr<TarjetaNivel>(content, "niveles.json");
  const pistas = arr<Pista>(content, "pistas.json");
  const red = arr<Presentacion>(content, "red.json");
  const prompts = content["prompts.json"] as Record<string, string> | undefined;
  const npcBase = prompts?.["npc-base"];
  if (typeof npcBase !== "string") throw new Error("contenido compilado sin prompts.json › npc-base");
  const seguridad = content["seguridad.json"] as { listas?: ListaBloqueo[]; contencion?: ArchivoContencion | null } | undefined;
  if (!seguridad?.contencion || !Array.isArray(seguridad.listas)) throw new Error("contenido compilado sin seguridad.json › contencion/listas: corré npm run build:content");
  return {
    missions,
    npc: (id) => npcs.find((n) => n.id === id),
    mission: (id) => missions.find((m) => m.id === id),
    scene: (missionId, sceneId) => missions.find((m) => m.id === missionId)?.escenas.find((e) => e.escena_id === sceneId),
    saber: (id) => saberes.find((s) => s.id === id),
    levelCard: (band) => niveles.find((n) => n.banda === band),
    clue: (id) => pistas.find((p) => p.id === id),
    introOf: (npcId) => red.find((r) => r.npc === npcId),
    npcBase,
    safety: { lists: seguridad.listas, containment: seguridad.contencion },
  };
}

/** `oNoAplica`: el valor o `{ no_aplica: "motivo" }` (02 §6.2). */
export const applies = <T>(v: T | { no_aplica: string }): T | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) && "no_aplica" in v ? null : (v as T);

export type NpcLine = Extract<LineaGuionada, { en: string }>;
export const isNpcLine = (l: LineaGuionada): l is NpcLine => "en" in l;

/** Líneas de salida si la escena no converge (o vacío si no aplica). */
export const exitLines = (scene: Escena): LineaGuionada[] => applies(scene.salida_si_no_converge)?.lineas ?? [];
/** Apertura guionada; una escena sin NPC (M0.2) abre con su primera línea guionada (la presentación de Lumi). */
export const openingLines = (scene: Escena): LineaGuionada[] =>
  applies(scene.apertura_guionada) ?? (scene.lineas_guionadas ?? []).slice(0, 1);

/** Huecos de una línea guionada: `[nombre]` (convención de las fichas) o `{nombre_jugador}` (plantillas, 02 §2.6). */
const SLOT = /(,\s*)?\s?(\[[\p{Ll}_]+\]|\{[\p{Ll}_]+\})/gu;
const PLAYER_SLOTS = new Set(["[nombre]", "{nombre_jugador}"]);

/**
 * Texto de una línea guionada listo para mostrar: el hueco del nombre se llena con el nombre de juego; sin nombre (el
 * avatar y el nombre llegan con el onboarding, más adelante) o con un hueco que el runtime todavía no sabe llenar, la
 * línea se dice sin el hueco ("Nice to meet you, [nombre]!" → "Nice to meet you!"). Nunca sale un `[hueco]` crudo.
 */
export function renderScriptedText(text: string, playerName: string | null): string {
  const name = playerName?.trim() || null;
  return text
    .replace(SLOT, (whole, comma: string | undefined, slot: string) =>
      name && PLAYER_SLOTS.has(slot) ? whole.replace(slot, name) : "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
