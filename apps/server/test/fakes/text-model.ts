// Modelos de texto falsos y determinísticos (03 §4.2 test/fakes/): sin red, sin claves, sin API paga (D-027).
// El NPC responde de un guion; el observador decide con una función sobre el texto del jugador.
import type { TextModelProvider, TextRequest } from "../../src/providers/text.ts";

export interface FakeModel extends TextModelProvider {
  readonly calls: TextRequest[];
}

/** NPC falso: devuelve las respuestas del guion en orden (y repite la última). */
export function fakeNpcModel(replies: readonly string[] = ["Good, good. Your turn!"]): FakeModel {
  const calls: TextRequest[] = [];
  return {
    id: "fake-npc",
    calls,
    generate(req) {
      calls.push(req);
      return Promise.resolve({ text: replies[Math.min(calls.length - 1, replies.length - 1)] ?? "Okay!" });
    },
  };
}

export interface ObserverCall {
  turnId: string;
  playerText: string;
  attempt: number;
}

/** Lee del pedido del observador el turnId y el texto del jugador (como los vería un modelo). */
export function readObserverRequest(req: TextRequest): { turnId: string; playerText: string } {
  const turnId = /Use turnId "([^"]+)"/.exec(req.system)?.[1] ?? "";
  const playerText = /Player said: (.*)$/m.exec(req.turns[0]?.text ?? "")?.[1] ?? "";
  return { turnId, playerText };
}

/** Observador falso: `decide` arma el texto de salida (JSON válido o no) para cada llamada. */
export function fakeObserverModel(decide: (call: ObserverCall) => string): FakeModel & { observed: ObserverCall[] } {
  const calls: TextRequest[] = [];
  const observed: ObserverCall[] = [];
  const attempts = new Map<string, number>();
  return {
    id: "fake-observer",
    calls,
    observed,
    generate(req) {
      calls.push(req);
      const { turnId, playerText } = readObserverRequest(req);
      const attempt = (attempts.get(turnId) ?? 0) + 1;
      attempts.set(turnId, attempt);
      const call = { turnId, playerText, attempt };
      observed.push(call);
      return Promise.resolve({ text: decide(call) });
    },
  };
}

export interface CriteriaRule {
  id: string;
  when: RegExp;
}

/** JSON de ObserverResult con los criterios que cumplen las reglas (cita = el texto del jugador). */
export function observerJson(call: ObserverCall, rules: readonly CriteriaRule[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    turnId: call.turnId,
    intended: call.playerText,
    errors: [],
    criteria: rules.filter((r) => r.when.test(call.playerText)).map((r) => ({ criterionId: r.id, met: true, quote: call.playerText })),
    evidence: [],
    offTopic: false,
    personalDataDetected: false,
    safety: "none",
    ...extra,
  });
}

/** Reglas de M0.1 (saludo + nombre) y M0.3 (Yes + ubicar a Clover). */
export const M01_RULES: CriteriaRule[] = [
  { id: "C1", when: /\b(hello|hi|hey|good morning)\b/i },
  { id: "C2", when: /\b(i'm|i am|my name is)\b/i },
];

export const M02_RULES: CriteriaRule[] = [{ id: "C1", when: /what'?s this/i }];
export const M03_RULES: CriteriaRule[] = [
  { id: "C1", when: /\b(yes|yeah|uh-huh)\b/i },
  { id: "C2", when: /\b(canal|bridge|there)\b/i },
];
