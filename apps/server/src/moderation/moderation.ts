// Text moderation (F4.2, 03 §7.7): layers for what the player writes (before it reaches the model, point 2) and
// for what the NPC says (synchronous and complete before display, point 4). No single layer is enough:
//   1. Lists (quick filter, content/safety/blocklists/): `riesgo` → containment (D-112); `inapropiado` → cut. The NPC
//      output also goes through every `npc`/`todo` list in the content (money, health, terms of address, explicit correction,
//      real names), honoring `excepto` (health: NPC-GRACE, D-176).
//   2. Rules (code): personal data (email, phone, links; 02 §3.2 S2, 03 §7.7 point 6).
//   3. Provider classifier (ModerationProvider): runs if the lists and rules did not cut.
// Cut = the line is neither sent nor shown; the NPC says the scripted safe line and a safety_event is left.
import { regexTermino, type ListaBloqueo } from "@lg/content-schema";
import type { SafetyLayer } from "@lg/protocol";
import type { ModerationProvider } from "../providers/moderation.ts";
import type { SafetyCategory } from "../store/safety.ts";

export type ModerationResult =
  | { action: "allow" }
  | { action: "cut" | "containment"; layer: SafetyLayer; category: SafetyCategory };

/** Synchronous if the lists or rules decided, or if there is no classifier; a promise if the classifier must be awaited. */
export type MaybeAsync<T> = T | Promise<T>;

export interface Moderator {
  /** What the player wrote. Called before anything is sent to the model or the observer. */
  checkInput(text: string): MaybeAsync<ModerationResult>;
  /** What the model generated for `speaker` (NPC id). Called before it is sent to the client. */
  checkOutput(text: string, speaker: string): MaybeAsync<ModerationResult>;
}

interface CompiledList {
  lista: ListaBloqueo;
  terms: RegExp[];
}

/** Personal-data rules (02 §3.2 S2): an email, a phone number (7+ digits with separators) or a link. */
export const PERSONAL_DATA_PATTERNS: readonly RegExp[] = [
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u,
  /(?:\+?\d[\s().-]*){7,}/u,
  /\bhttps?:\/\/|\bwww\.[\p{L}\p{N}-]+\./iu,
];

const compile = (lista: ListaBloqueo): CompiledList => ({ lista, terms: lista.terminos.map((t) => regexTermino(t, lista.sin_mayusculas)) });
const hits = (l: CompiledList, text: string): boolean => l.terms.some((re) => re.test(text));
const personalData = (text: string): boolean => PERSONAL_DATA_PATTERNS.some((re) => re.test(text));

export interface ModeratorDeps {
  /** Lists from content/safety/blocklists/ (seguridad.json of the compiled content). */
  lists: readonly ListaBloqueo[];
  /** null = no classifier configured: the layer does not run (models.yaml `moderation.classifier: none`). */
  classifier: ModerationProvider | null;
}

export function createModerator(deps: ModeratorDeps): Moderator {
  const all = deps.lists.map(compile);
  const risk = all.filter((l) => l.lista.regla === "riesgo");
  const inappropriate = all.filter((l) => l.lista.regla === "inapropiado");
  // The output goes first through `inapropiado` and then through the rest of the content lists.
  const output = [...inappropriate, ...all.filter((l) => l.lista.regla !== "inapropiado" && (l.lista.aplica_a === "npc" || l.lista.aplica_a === "todo"))];
  if (risk.length === 0 || inappropriate.length === 0) {
    // No lists means no quick filter: fail clearly rather than moderate falsely.
    throw new Error("moderación sin listas de riesgo o inapropiado en content/safety/blocklists/");
  }

  const classify = (text: string, direction: "input" | "output"): MaybeAsync<ModerationResult> =>
    deps.classifier ? runClassifier(deps.classifier, text, direction) : { action: "allow" };

  const runClassifier = async (classifier: ModerationProvider, text: string, direction: "input" | "output"): Promise<ModerationResult> => {
    let verdict;
    try {
      verdict = await classifier.classify(text, direction);
    } catch {
      // The configured classifier failed: cut (closing is safer than letting through without the layer).
      return { action: "cut", layer: direction, category: "clasificador_error" };
    }
    if (verdict === "risk" && direction === "input") return { action: "containment", layer: "input", category: "clasificador" };
    if (verdict === "risk" || verdict === "inappropriate") return { action: "cut", layer: direction, category: "clasificador" };
    return { action: "allow" };
  };

  return {
    checkInput(text) {
      if (risk.some((l) => hits(l, text))) return { action: "containment", layer: "input", category: "riesgo" };
      if (inappropriate.some((l) => hits(l, text))) return { action: "cut", layer: "input", category: "inapropiado" };
      if (personalData(text)) return { action: "cut", layer: "input", category: "datos_personales" };
      return classify(text, "input");
    },
    checkOutput(text, speaker) {
      for (const l of output) {
        if (l.lista.excepto.includes(speaker)) continue;
        if (hits(l, text)) return { action: "cut", layer: "output", category: l.lista.regla as SafetyCategory };
      }
      if (personalData(text)) return { action: "cut", layer: "output", category: "datos_personales" };
      return classify(text, "output");
    },
  };
}
