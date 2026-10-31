// Typed view of the server's compiled content (apps/server/generated/content/, D-159). The F1.2 compiler already
// validated everything against @lg/content-schema; here it is only indexed. Types come from the schema (type import: at runtime
// the server does not load the compiler).
import type { ArchivoContencion, Escena, FichaConversacion, LineaGuionada, ListaBloqueo, Mision, Npc, Pista, Presentacion, Saber, TarjetaNivel } from "@lg/content-schema";
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
  /** Edge of the network that presents `npcId` (the first; D-168). */
  introOf(npcId: string): Presentacion | undefined;
  /** A2 (ADR-027): meters conversation sheet (`escena.conversacion`). */
  conversation(id: string): FichaConversacion | undefined;
  npcBase: string;
  /** Block lists (runtime moderation, F4.2) and containment + safe line (D-112). */
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
  // Optional: content compiled before A2 doesn't have it (and no scene asks for it).
  const conversaciones = Array.isArray(content["conversaciones.json"]) ? content["conversaciones.json"] as FichaConversacion[] : [];
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
    conversation: (id) => conversaciones.find((c) => c.id === id),
    npcBase,
    safety: { lists: seguridad.listas, containment: seguridad.contencion },
  };
}

/** `oNoAplica`: the value or `{ no_aplica: "motivo" }` (02 §6.2). */
export const applies = <T>(v: T | { no_aplica: string }): T | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) && "no_aplica" in v ? null : (v as T);

export type NpcLine = Extract<LineaGuionada, { en: string }>;
export const isNpcLine = (l: LineaGuionada): l is NpcLine => "en" in l;

/** Exit lines if the scene doesn't converge (or empty if not applicable). */
export const exitLines = (scene: Escena): LineaGuionada[] => applies(scene.salida_si_no_converge)?.lineas ?? [];
/** Scripted opening; a scene with no NPC (M0.2) opens with its first scripted line (Lumi's introduction). */
export const openingLines = (scene: Escena): LineaGuionada[] =>
  applies(scene.apertura_guionada) ?? (scene.lineas_guionadas ?? []).slice(0, 1);

/** Gaps in a scripted line: `[nombre]` (sheet convention) or `{nombre_jugador}` (templates, 02 §2.6). */
const SLOT = /(,\s*)?\s?(\[[\p{Ll}_]+\]|\{[\p{Ll}_]+\})/gu;
const PLAYER_SLOTS = new Set(["[nombre]", "{nombre_jugador}"]);

/**
 * Text of a scripted line ready to display: the name gap is filled with the game name; with no name (the
 * avatar and name arrive with the onboarding, later) or with a gap the runtime doesn't yet know how to fill, the
 * line is said without the gap ("Nice to meet you, [nombre]!" → "Nice to meet you!"). A raw `[hueco]` never comes out.
 */
export function renderScriptedText(text: string, playerName: string | null): string {
  const name = playerName?.trim() || null;
  return text
    .replace(SLOT, (whole, comma: string | undefined, slot: string) =>
      name && PLAYER_SLOTS.has(slot) ? whole.replace(slot, name) : "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
