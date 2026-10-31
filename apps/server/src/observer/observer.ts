// Observer v0 (03 §5.6-§5.7, ADR-008): a text call separate from the NPC that returns JSON validated against
// ObserverResult (@lg/protocol). Invalid output → 1 retry → error result; never an invented criterion: ids
// that don't exist in the scene are discarded afterwards (core/scene/criteria) and only what validates gets through here.
// F5.1a: in a voice scene it also receives the turn's audio clip (D-095), read-only; scene-runtime builds and releases it.
// The audio travels in the request to the model and the observer does not keep it.
import { ObserverResultSchema, type ObserverResult } from "@lg/protocol";
import type { TextModelProvider } from "../providers/text.ts";
import type { TurnClipView } from "../scene-runtime/turn-clip.ts";

export interface ObserverInput {
  turnId: string;
  playerText: string;
  lastNpcLine: string | null;
  criteria: readonly { id: string; texto: string }[];
  /** Target structures of the mission (ids the evidence may cite). */
  structures: readonly string[];
  cefrBand: string;
  /** Turn clip (voice). null or absent in text. */
  audio?: TurnClipView | null;
}

export type ObserverOutcome =
  | { ok: true; result: ObserverResult; attempts: number }
  | { ok: false; attempts: number; reason: string };

export const OBSERVER_MAX_ATTEMPTS = 2;

/** Observer prompt: outside the fiction, forced JSON. Server only. */
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
    ...(input.audio ? ["The audio of the player's turn is attached. The transcript may hide errors (speech recognition tends to fix grammar): judge what the player actually said in the audio."] : []),
  ].join("\n");
}

const observerTurn = (input: ObserverInput): string =>
  [input.lastNpcLine ? `NPC said: ${input.lastNpcLine}` : "NPC said: (nothing yet)", `Player said: ${input.playerText}`].join("\n");

/** Validates the model's text: complete JSON, strict schema and the requested turnId. */
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
      // The clip is read at request time (a copy); if it was already released, the turn is evaluated with the text only.
      const audio = input.audio && !input.audio.released ? { pcm16: input.audio.pcm16(), sampleRate: input.audio.sampleRate } : null;
      const res = await model.generate({
        system: observerPrompt(input), turns: [{ role: "user", text: observerTurn(input) }],
        json: true, maxOutputTokens: limits.maxOutputTokens, timeoutMs: limits.timeoutMs, ...(audio ? { audio } : {}),
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
