// Scripted models to walk through the game WITHOUT a key and without a paid API (F4.2; D-027): `LG_FAKE_MODELS=1`, operator mode
// only. Deterministic and offline. The NPC replies with short phrases from a fixed script; the observer marks as
// fulfilled all of the scene's criteria on the player's first turn (with their text as the quote), so the operator
// can walk through the whole prologue by text (H1) without depending on the model. It evaluates nothing for real: it is for seeing the flow.
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

/** Reads from the observer request the turnId, the criterion ids and the player's text (observer.ts format). */
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
 * A2 (ADR-027): scripted judge for the meters conversation, to walk through the flow without a key. Reads from the request (format
 * of conversation/judge.ts) the exchange and the list of facts, and labels with word rules: a question reveals the
 * first not-yet-known fact of each level (the engine discards those of closed levels), "I'm/I work/I like/from"
 * counts as own data, and in the goal phase it recognizes the errand, the polite request and the objections by words.
 * It evaluates nothing for real: it is for seeing the bars move and the phase change.
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
        // D-813 (M6): word rules for other books; its objection is emitted only if the request lists it (it invents no ids).
        if (listed.has("pregunta") && /\b(silver|where did|who (finally )?kept)\b/.test(p)) objections.push({ id: "pregunta", quality: "yes" });
      }
      return Promise.resolve({
        text: JSON.stringify({ language: "L2", comprehensible: 2, acts, npc_facts: npcFacts, player_facts: playerFacts, objections, safety: "none" }),
      });
    },
  };
}
