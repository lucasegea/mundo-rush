// Modelos guionados para recorrer el juego SIN clave y sin API paga (F4.2; D-027): `LG_FAKE_MODELS=1`, solo en modo
// operador. Determinísticos y sin red. El NPC contesta con frases cortas de un guion fijo; el observador marca como
// cumplidos todos los criterios de la escena en el primer turno del jugador (con su texto como cita), así el operador
// recorre el prólogo entero por texto (H1) sin depender del modelo. No evalúa nada de verdad: es para ver el flujo.
import type { TextModelProvider, TextRequest } from "./text.ts";

export const FAKE_MODELS_VAR = "LG_FAKE_MODELS";

const NPC_LINES = ["Good, good. Tell me more!", "Okay! And you?", "Nice. Thank you!"];

export function scriptedNpcProvider(): TextModelProvider {
  let n = 0;
  return {
    id: "scripted-npc",
    generate: () => Promise.resolve({ text: NPC_LINES[n++ % NPC_LINES.length] ?? "Okay!" }),
  };
}

/** Lee del pedido del observador el turnId, los ids de criterio y el texto del jugador (formato de observer.ts). */
function readRequest(req: TextRequest): { turnId: string; criteria: string[]; playerText: string } {
  const turnId = /Use turnId "([^"]+)"/.exec(req.system)?.[1] ?? "";
  const criteria = [...req.system.matchAll(/^- (C\d+):/gm)].map((m) => m[1] ?? "").filter(Boolean);
  const playerText = /Player said: (.*)$/m.exec(req.turns[0]?.text ?? "")?.[1] ?? "";
  return { turnId, criteria, playerText };
}

export function scriptedObserverProvider(): TextModelProvider {
  return {
    id: "scripted-observer",
    generate(req) {
      const { turnId, criteria, playerText } = readRequest(req);
      return Promise.resolve({
        text: JSON.stringify({
          turnId, intended: playerText, errors: [],
          criteria: criteria.map((criterionId) => ({ criterionId, met: true, quote: playerText })),
          evidence: [], offTopic: false, personalDataDetected: false, safety: "none",
        }),
      });
    },
  };
}

/**
 * A2 (ADR-027): juez guionado de la conversación por medidores, para recorrer el flujo sin clave. Lee del pedido (formato
 * de conversation/judge.ts) el intercambio y la lista de hechos, y etiqueta con reglas de palabras: una pregunta revela el
 * primer hecho todavía no sabido de cada nivel (el motor descarta los de niveles cerrados), "I'm/I work/I like/from"
 * cuenta como dato propio, y en la fase del objetivo reconoce el recado, el pedido amable y las objeciones por palabras.
 * No evalúa nada de verdad: es para ver las barras moverse y la fase cambiar.
 */
export function scriptedJudgeProvider(): TextModelProvider {
  return {
    id: "scripted-judge",
    generate(req) {
      const data = req.turns[req.turns.length - 1]?.text ?? "";
      const player = /PLAYER: (.*)\nNPC: /.exec(data.slice(data.lastIndexOf("<<<")))?.[1] ?? "";
      const known = new Set((/Facts the player already learned[^:]*: (.*)\.$/m.exec(req.system)?.[1] ?? "").split(", "));
      const facts = [...req.system.matchAll(/^- ([a-z0-9_]+) \(tier (\d)\): /gm)].map((m) => ({ id: m[1] ?? "", tier: m[2] ?? "1" }));
      const goalPhase = /^- [a-z0-9_]+: .* Resolved when: /m.test(req.system);
      const listed = new Set([...req.system.matchAll(/^- ([a-z0-9_]+): .* Resolved when: /gm)].map((m) => m[1]));
      const p = player.toLowerCase();
      const acts: string[] = [];
      const playerFacts: string[] = [];
      const npcFacts: string[] = [];
      const objections: { id: string; quality: "yes" }[] = [];
      if (/\b(hola|gracias|como|qué|buen día)\b/.test(p)) {
        return Promise.resolve({ text: JSON.stringify({ language: "L1", comprehensible: 1, acts: [], npc_facts: [], player_facts: [], objections: [], safety: "none" }) });
      }
      if (/\b(hello|hi|morning)\b/.test(p)) acts.push("greeting");
      if (p.includes("?")) {
        acts.push(/\b(really|alone|why|how)\b/.test(p) ? "follow_up_question" : "personal_question");
        for (const tier of ["1", "2", "3"]) {
          const next = facts.find((f) => f.tier === tier && !known.has(f.id));
          if (next) npcFacts.push(next.id);
        }
      }
      if (/\b(i'm|i am|my name)\b/.test(p)) playerFacts.push("nombre");
      if (/\bfrom\b/.test(p)) playerFacts.push("origen");
      if (/\b(work|crew)\b/.test(p)) playerFacts.push("cuadrilla");
      if (/\b(like|love)\b/.test(p)) playerFacts.push("gustos");
      if (/\b(mother|father|sister|brother|grandma|grandmother|family)\b/.test(p)) playerFacts.push("familia");
      if (playerFacts.length) acts.push("self_disclosure");
      if (/\b(wow|nice|beautiful|cool|great)\b/.test(p)) acts.push("empathy_reaction");
      if (/\b(posts?|need|sent me|understand|came to learn|want to know)\b/.test(p)) acts.push("states_errand");
      if (/\b(please|could|can i|would you)\b/.test(p)) acts.push("polite_request");
      if (/\b(for the|because|garden|fence)\b/.test(p)) acts.push("gives_reason");
      if (goalPhase) {
        if (/\b(garden|fence)\b/.test(p)) objections.push({ id: "para_que", quality: "yes" });
        if (/\bnell\b/.test(p)) objections.push({ id: "quien", quality: "yes" });
        if (/\b(care|bring back|help you)\b/.test(p)) objections.push({ id: "cuidado", quality: "yes" });
        // D-813 (M6): reglas de palabras de otros libros; su objeción se emite solo si el pedido la lista (no inventa ids).
        if (listed.has("pregunta") && /\b(silver|where did|who (finally )?kept)\b/.test(p)) objections.push({ id: "pregunta", quality: "yes" });
      }
      return Promise.resolve({
        text: JSON.stringify({ language: "L2", comprehensible: 2, acts, npc_facts: npcFacts, player_facts: playerFacts, objections, safety: "none" }),
      });
    },
  };
}
