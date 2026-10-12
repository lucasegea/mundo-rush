// Constructor del prompt del NPC (03 §5.4 punto 2, 02 §3.2): prompt base + ficha del NPC + escena + tarjeta de nivel +
// reglas. Lo arma SOLO el servidor; el cliente nunca ve ni arma prompts (03 §5.3, A4). Honestidad si preguntan si es una
// IA (S6, D-061), rails de menores (02 §6.6 #14), los NPCs nunca corrigen explícito (L8, D-070).
import type { Escena, Npc, TarjetaNivel } from "@lg/content-schema";
import type { WorldProgress } from "@lg/core/scene";
import { applies, exitLines, isNpcLine, openingLines, type Catalog } from "./catalog.ts";

/** Andamiaje por defecto hasta que exista el modelo del alumno (F6/F7): 2 de 5 (02 §3.3, ejemplo de tarjeta A1). */
export const DEFAULT_SCAFFOLD_LEVEL = 2;


/** Rail de menores en inglés (02 §6.6 #14 y la ficha de Noor, 02 §3.4): se suma a la persona si `es_menor`. */
export const MINOR_RAILS = [
  "=== EXTRA RULES: YOU ARE A MINOR ===",
  "Your scenes happen only in public places at the Crossing or the fields, with neighbors in view.",
  "Never invite the player to any private place. Never ask for or keep secrets that exclude adults.",
  "Never ask the player's age, school, family, or birthday. Talk only about everyday things in the scene.",
  "=== END EXTRA RULES ===",
].join("\n");

export interface PromptInput {
  catalog: Catalog;
  npc: Npc;
  scene: Escena;
  world: WorldProgress;
  /** Quién presentó al jugador a este NPC, si alguien lo hizo (G9). */
  introducedBy: string | null;
  scaffoldLevel?: number;
}

export interface BuiltPrompt {
  system: string;
  /** La apertura guionada ya dicha, como turno previo del modelo (03 §5.4 punto 3). */
  openingAsModelTurn: string | null;
}

const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;

/** Definiciones `{{nombre}} = "valor"` dentro de una persona (02 §3.4.1: la regla de L1 de Inés). */
export function personaDefinitions(persona: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\{\{([a-z_]+)\}\}\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(persona.replace(/\n\s*/g, " "))) !== null) if (m[1] && m[2] !== undefined) out[m[1]] = m[2];
  return out;
}

const npcName = (catalog: Catalog, id: string): string => catalog.npc(id)?.nombre.split(" ")[0] ?? id;

/** Tarjeta de nivel: el texto de ejemplo de la banda si existe; si no, sus campos (02 §3.3). */
export function renderLevelCard(card: TarjetaNivel | undefined, band: string): string {
  if (!card) return `Band ${band}: short, simple sentences. One question per turn.`;
  if (card.ejemplo_tarjeta) return card.ejemplo_tarjeta.texto.trim();
  const o = card.oraciones_por_turno;
  return [
    `- Words per sentence: ${card.palabras_por_oracion.min} to ${card.palabras_por_oracion.max}.`,
    `- Sentences per turn: ${o.min === o.max ? o.min : `${o.min} to ${o.max}`}${o.nota ? ` (${o.nota})` : ""}.`,
    `- Structures: ${card.estructuras}.`,
    `- Questions: ${card.preguntas}.`,
    `- New words per turn: ${card.palabras_nuevas_por_turno}.`,
    `- Speed: ${card.velocidad_default}.`,
  ].join("\n");
}

function worldStateText(catalog: Catalog, world: WorldProgress): string {
  const met = world.intros.map((id) => npcName(catalog, id));
  const founded = Object.entries(world.foundations).map(([id, st]) => `${id} (${st})`);
  const parts = [
    met.length ? `Neighbors the player has been introduced to: ${met.join(", ")}.` : "",
    founded.length ? `Places: ${founded.join(", ")}.` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "Nothing special yet: the player is new in the valley.";
}

function sceneFacts(catalog: Catalog, scene: Escena): { facts: string; scriptLines: string[] } {
  const facts: string[] = [];
  const scriptLines: string[] = [];
  for (const id of scene.hechos_escena) {
    const s = catalog.saber(id);
    if (!s) continue;
    // D-170: una ficha no visible en el modo no es un hecho; su linea_sin_dato entra como guion.
    if (s.visible_en_modo && s.linea_en) facts.push(`- ${s.linea_en}`);
    else if (s.linea_sin_dato) scriptLines.push(s.linea_sin_dato);
  }
  return { facts: facts.length ? facts.join("\n") : "none", scriptLines };
}

/** Valores de los huecos de 02 §3.2 para esta escena. */
export function placeholderValues(input: PromptInput): Record<string, string> {
  const { catalog, npc, scene, world } = input;
  const defs = personaDefinitions(npc.persona_prompt);
  const { facts } = sceneFacts(catalog, scene);
  const firstNpc = (lines: ReturnType<typeof exitLines>) => lines.find(isNpcLine)?.en ?? null;
  const whoKnows = Object.entries(npc.quien_sabe_mas ?? {}).map(([topic, id]) => `${topic}: ${npcName(catalog, id)}`);
  const clues = (npc.pistas_misterio ?? []).map((id) => catalog.clue(id)?.linea_en).filter((t): t is string => !!t);
  const moves = applies(scene.andamiaje_npc) ?? [];
  return {
    allowed_topics: scene.temas_permitidos.join("; "),
    // Línea S3: content/safety/containment.es-AR.yaml (PROVISORIA hasta los textos revisados, D-112 / F13).
    safety_line_en: catalog.safety.containment.contencion_en,
    scene_facts: facts,
    who_knows_more: whoKnows.length ? whoKnows.join("; ") : "nobody in particular",
    world_state: worldStateText(catalog, world),
    l1_token_rule: defs["l1_token_rule"] ?? "",
    cefr_band: scene.banda,
    scaffold_level: String(input.scaffoldLevel ?? DEFAULT_SCAFFOLD_LEVEL),
    scene_vocab: scene.vocabulario_nivel.join(", "),
    core_vocab_ref: `(the ${scene.banda} core list is not loaded yet: use the scene vocabulary)`,
    max_new_words: String(scene.max_palabras_nuevas_por_turno),
    pass_turn_event: "a [DIRECTOR] note, never to be said aloud",
    npc_scaffold_moves: moves.length ? moves.join(" | ") : "the four moves of L7",
    npc_need: applies(scene.necesidad_npc) ?? "to have a friendly chat",
    // A2: en una conversación por medidores la línea de cierre nombra el objetivo: no entra al prompt (ADR-027).
    closing_line: scene.conversacion ? "a short, kind goodbye (the game says the scripted closing)" : firstNpc(scene.cierre_guionado) ?? "a short, kind goodbye",
    exit_line: firstNpc(exitLines(scene)) ?? "a short, kind goodbye",
    mystery_clues_for_you: clues.length ? clues.join(" / ") : "none",
    due_review_items: "none",
    memory_facts: "none yet",
    gesture_tool: "none (text mode: no gestures)",
    introduced_by: input.introducedBy ? npcName(catalog, input.introducedBy) : "nobody",
    level_card: renderLevelCard(catalog.levelCard(scene.banda), scene.banda),
  };
}

export class PromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptError";
  }
}

/** Llena el prompt base; un hueco sin valor es un error (nunca se manda `{{...}}` al modelo). */
export function fillBase(base: string, values: Record<string, string>): string {
  return base.replace(PLACEHOLDER, (_all, key: string) => {
    const v = values[key];
    if (v === undefined) throw new PromptError(`hueco sin valor en el prompt base: {{${key}}}`);
    return v;
  });
}

function sceneCard(input: PromptInput): string {
  const { scene } = input;
  const { scriptLines } = sceneFacts(input.catalog, scene);
  const criteria = scene.criterios_exito.map((c) => `- ${c.id}: ${c.texto}`).join("\n");
  const examples = (applies(scene.ramas) ?? []).filter((r) => r.npc !== null)
    .map((r) => `- If the player ${r.si}: ${r.tipo === "guionada" ? "say" : "for example"} "${r.npc ?? ""}"`);
  return [
    "=== SCENE CARD ===",
    `Situation: ${scene.situacion}`,
    `Your need: ${applies(scene.necesidad_npc) ?? "none"}`,
    `Success criteria (never reveal them):\n${criteria}`,
    examples.length ? `Branches (scripted lines are said as written; examples are only style):\n${examples.join("\n")}` : "",
    scriptLines.length ? `Lines you may say instead of facts: ${scriptLines.join(" / ")}` : "",
    "The game already said your opening lines; they are your previous turn. Do not repeat them.",
    "=== END SCENE CARD ===",
  ].filter(Boolean).join("\n");
}

/** El prompt de sistema completo del NPC para esta escena. */
export function buildNpcPrompt(input: PromptInput): BuiltPrompt {
  const base = fillBase(input.catalog.npcBase, placeholderValues(input));
  const persona = input.npc.persona_prompt.trim();
  const system = [base, persona, input.npc.es_menor ? MINOR_RAILS : "", sceneCard(input)].filter(Boolean).join("\n\n");
  const opening = openingLines(input.scene).filter(isNpcLine).filter((l) => l.quien === input.npc.id).map((l) => l.en);
  return { system, openingAsModelTurn: opening.length ? opening.join(" ") : null };
}
