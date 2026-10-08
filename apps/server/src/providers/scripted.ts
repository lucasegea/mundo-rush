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
