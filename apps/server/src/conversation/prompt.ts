// NPC note for a meters conversation (ADR-027; the research report 2.4): added to the scene prompt
// (base + persona + card) and changes with the encounter state. Golden rules:
//   1. What the NPC does not have it cannot leak: the goal (errand, objections, bridge) enters only in its phase.
//   2. Only the facts of the open levels are in the prompt (the code opens levels, not the model).
//   3. Refines S2 for this scene: talk about the CHARACTER's life in the game; never real data. No romance.
// English: it is for the model. The player never sees it (03 §5.3).
import type { EncounterState } from "@lg/core/conversation";
import type { FichaConversacion } from "@lg/content-schema";

const RULES = [
  "CONVERSATION RULES FOR THIS SCENE (they refine S2 and L5; the hard safety rules still win):",
  "- This scene has no script. Talk like a real person: answer what the player asks with ONE thing about you at a time, in few words. Never tell your whole life at once.",
  "- Everything about the player is about their game CHARACTER. You may ask about their game name, their work on the crew, where their character comes from (any game answer), and what they like in the valley.",
  "- Never ask for real personal data: age, surname, school, address, phone, email, photos, social media, or real family. If the player shares real personal data, do not repeat it and gently go back to the valley.",
  "- No romance or flirting, ever. No compliments about looks.",
  "- If the player asks you two questions in a row and tells you nothing about themselves, answer shortly and ask them something back before you tell more.",
  "- Never talk about points, meters, levels, or what the player must do. Stay in character.",
].join("\n");

const RAPPORT_PHASE = [
  "WHERE YOU ARE: you are just getting to know this newcomer. You have no business with them and you expect none.",
  "If they ask you for something or try to talk business, say kindly that you don't know them yet and ask about them instead.",
].join("\n");

const DONE_PHASE = "WHERE YOU ARE: you already agreed to help. Keep it short and kind; the game says your closing line.";

/** The NPC note for the current encounter state. */
export function conversationBrief(f: FichaConversacion, state: EncounterState): string {
  const goal = f.medidores[1];
  const facts = f.hechos.filter((h) => h.nivel <= state.unlockedTier).map((h) => `- ${h.valor_en}`);
  const secrets = f.secretos.map((s) => {
    const open = s.revela_si && s.revela_en && meterFill(f, state, s.revela_si.medidor) >= s.revela_si.llenado_min;
    return open ? `- ${s.revela_en}` : `- ${s.desvio_en}`;
  });
  const lines = [
    "=== FREE CONVERSATION ===",
    f.persona_extra_en.trim(),
    `RIGHT NOW: ${f.mundo_en.trim()}`,
    RULES,
    "WHAT YOU MAY TELL ABOUT YOURSELF NOW (only these; for other personal things say \"Hm. Another day.\" and move on):",
    ...facts,
    "SECRETS (never break these):",
    ...secrets,
  ];
  if (state.active === 0) lines.push(RAPPORT_PHASE);
  else if (state.active === 1) {
    lines.push(
      "WHERE YOU ARE: you feel you know this person a little now, and you like them.",
      `WHY THEY CAME (you learn it when they tell you): ${goal.tema_en.trim()}`,
      `WHAT YOU WANT IN THIS PART: ${goal.lo_que_el_npc_quiere_en.trim()}`,
      "BEFORE YOU AGREE, you want these things (ask about ONE at a time, in your own few words, only if the player has not covered it):",
      ...goal.objeciones.map((o) => `- ${o.npc_en}`),
      `OPENING THIS PART: ${goal.puente_en.trim()} Do it only once; if they already told you why they came, skip it.`,
      "Never give a final yes and never hand anything over yourself. When they have explained and asked kindly, say something short and warm like \"Hm. Maybe.\": the game says your closing line.",
    );
  } else lines.push(DONE_PHASE);
  lines.push("=== END FREE CONVERSATION ===");
  return lines.filter((l) => l !== "").join("\n");
}

/** Raw fill of a meter by id (for the secrets' conditions): full = 1; active = its points. */
function meterFill(f: FichaConversacion, state: EncounterState, meterId: string): number {
  const i = f.medidores.findIndex((m) => m.id === meterId);
  if (i < 0) return 0;
  if (i < state.active) return 1;
  if (i > state.active) return 0;
  const m = f.medidores[i];
  const ms = state.meters[i];
  if (!m || !ms) return 0;
  if (m.tipo === "rapport") return Math.min(1, ms.points / m.reglas.objetivo);
  const total = m.pasos.reduce((n, p) => n + p.puntos, 0);
  return total > 0 ? Math.min(1, ms.points / total) : 0;
}
