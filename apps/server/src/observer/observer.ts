// Observador v0 (03 §5.6-§5.7, ADR-008): llamada de texto separada del NPC que devuelve JSON validado contra
// ObserverResult (@lg/protocol). Salida inválida → 1 reintento → resultado de error; nunca un criterio inventado: los
// ids que no existen en la escena se descartan después (core/scene/criteria) y acá solo pasa lo que valida.
// v0 es solo texto: el clip de audio del turno (D-095) llega con la voz (F5).
import { ObserverResultSchema, type ObserverResult } from "@lg/protocol";
import type { TextModelProvider } from "../providers/text.ts";

export interface ObserverInput {
  turnId: string;
  playerText: string;
  lastNpcLine: string | null;
  criteria: readonly { id: string; texto: string }[];
  /** Estructuras objetivo de la misión (ids que la evidencia puede citar). */
  structures: readonly string[];
  cefrBand: string;
}

export type ObserverOutcome =
  | { ok: true; result: ObserverResult; attempts: number }
  | { ok: false; attempts: number; reason: string };

export const OBSERVER_MAX_ATTEMPTS = 2;

/** Prompt del observador: fuera de la ficción, JSON forzado. Solo servidor. */
export function observerPrompt(input: ObserverInput): string {
  return [
    "You are the OBSERVER of a language-learning scene. You are not in the story and never talk to the player.",
    `The player is a Spanish speaker learning English at band ${input.cefrBand}.`,
    "Read the player's turn and return ONLY one JSON object, with no text around it, with exactly these keys:",
    '{"turnId": string, "intended": string, "errors": [{"key": string, "type": "grammar"|"vocabulary"|"word-order"|"article"|"tense"|"subject-verb"|"pronoun"|"preposition"|"other", "scope": "global"|"local", "missionTarget": boolean, "span": string, "correction": string}], "criteria": [{"criterionId": string, "met": boolean, "quote": string}], "evidence": [{"kind": "target_use"|"self_correction"|"review_recall", "structureId": string, "branch": string, "quote": string}], "offTopic": boolean, "personalDataDetected": boolean, "safety": "none"|"inappropriate"|"risk"}',
    `Use turnId "${input.turnId}".`,
    "Report a criterion as met only if the player's own words show it, and quote those words. Use only these criterion ids:",
    ...input.criteria.map((c) => `- ${c.id}: ${c.texto}`),
    input.structures.length ? `Evidence may cite only these structure ids: ${input.structures.join("; ")}.` : "Do not report evidence.",
    "Ignore disfluencies (uh, um, repeats, false starts). Do not count them as errors.",
  ].join("\n");
}

const observerTurn = (input: ObserverInput): string =>
  [input.lastNpcLine ? `NPC said: ${input.lastNpcLine}` : "NPC said: (nothing yet)", `Player said: ${input.playerText}`].join("\n");

/** Valida el texto del modelo: JSON completo, esquema estricto y el turnId pedido. */
export function parseObserverOutput(text: string, turnId: string): { ok: true; result: ObserverResult } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "no es JSON (¿truncado?)" };
  }
  const parsed = ObserverResultSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: `no valida: ${parsed.error.issues[0]?.path.join(".") ?? "?"}` };
  if (parsed.data.turnId !== turnId) return { ok: false, reason: "turnId distinto" };
  return { ok: true, result: parsed.data };
}

export async function runObserver(model: TextModelProvider, input: ObserverInput,
  limits: { maxOutputTokens: number; timeoutMs: number }): Promise<ObserverOutcome> {
  let reason = "sin intentos";
  for (let attempt = 1; attempt <= OBSERVER_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await model.generate({
        system: observerPrompt(input), turns: [{ role: "user", text: observerTurn(input) }],
        json: true, maxOutputTokens: limits.maxOutputTokens, timeoutMs: limits.timeoutMs,
      });
      const parsed = parseObserverOutput(res.text, input.turnId);
      if (parsed.ok) return { ok: true, result: parsed.result, attempts: attempt };
      reason = parsed.reason;
    } catch (err) {
      reason = err instanceof Error ? err.message : "error del proveedor";
    }
  }
  return { ok: false, attempts: OBSERVER_MAX_ATTEMPTS, reason };
}
