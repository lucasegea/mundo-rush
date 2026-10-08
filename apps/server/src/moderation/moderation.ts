// Moderación de texto (F4.2, 03 §7.7): capas para lo que escribe el jugador (antes de que llegue al modelo, punto 2) y
// para lo que dice el NPC (síncrona y completa antes de mostrar, punto 4). Ninguna capa sola alcanza:
//   1. Listas (filtro rápido, content/safety/blocklists/): `riesgo` → contención (D-112); `inapropiado` → corte. La salida
//      del NPC además pasa por toda lista `npc`/`todo` del contenido (dinero, salud, apelativos, corrección explícita,
//      nombres reales), respetando `excepto` (salud: NPC-GRACE, D-176).
//   2. Reglas (código): datos personales (email, teléfono, enlaces; 02 §3.2 S2, 03 §7.7 punto 6).
//   3. Clasificador del proveedor (ModerationProvider): corre si las listas y las reglas no cortaron.
// Corte = la línea no se manda ni se muestra; el NPC dice la línea segura guionada y queda un safety_event.
import { regexTermino, type ListaBloqueo } from "@lg/content-schema";
import type { SafetyLayer } from "@lg/protocol";
import type { ModerationProvider } from "../providers/moderation.ts";
import type { SafetyCategory } from "../store/safety.ts";

export type ModerationResult =
  | { action: "allow" }
  | { action: "cut" | "containment"; layer: SafetyLayer; category: SafetyCategory };

/** Síncrono si decidieron las listas o las reglas, o si no hay clasificador; promesa si hay que esperar al clasificador. */
export type MaybeAsync<T> = T | Promise<T>;

export interface Moderator {
  /** Lo que escribió el jugador. Se llama antes de mandar nada al modelo o al observador. */
  checkInput(text: string): MaybeAsync<ModerationResult>;
  /** Lo que generó el modelo para `speaker` (id de NPC). Se llama antes de mandarlo al cliente. */
  checkOutput(text: string, speaker: string): MaybeAsync<ModerationResult>;
}

interface CompiledList {
  lista: ListaBloqueo;
  terms: RegExp[];
}

/** Reglas de datos personales (02 §3.2 S2): un email, un teléfono (7+ dígitos con separadores) o un enlace. */
export const PERSONAL_DATA_PATTERNS: readonly RegExp[] = [
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u,
  /(?:\+?\d[\s().-]*){7,}/u,
  /\bhttps?:\/\/|\bwww\.[\p{L}\p{N}-]+\./iu,
];

const compile = (lista: ListaBloqueo): CompiledList => ({ lista, terms: lista.terminos.map((t) => regexTermino(t, lista.sin_mayusculas)) });
const hits = (l: CompiledList, text: string): boolean => l.terms.some((re) => re.test(text));
const personalData = (text: string): boolean => PERSONAL_DATA_PATTERNS.some((re) => re.test(text));

export interface ModeratorDeps {
  /** Listas de content/safety/blocklists/ (seguridad.json del contenido compilado). */
  lists: readonly ListaBloqueo[];
  /** null = sin clasificador configurado: la capa no corre (models.yaml `moderation.classifier: none`). */
  classifier: ModerationProvider | null;
}

export function createModerator(deps: ModeratorDeps): Moderator {
  const all = deps.lists.map(compile);
  const risk = all.filter((l) => l.lista.regla === "riesgo");
  const inappropriate = all.filter((l) => l.lista.regla === "inapropiado");
  // La salida pasa primero por `inapropiado` y después por el resto de las listas de contenido.
  const output = [...inappropriate, ...all.filter((l) => l.lista.regla !== "inapropiado" && (l.lista.aplica_a === "npc" || l.lista.aplica_a === "todo"))];
  if (risk.length === 0 || inappropriate.length === 0) {
    // Sin listas no hay filtro rápido: falla claro antes que moderar en falso.
    throw new Error("moderación sin listas de riesgo o inapropiado en content/safety/blocklists/");
  }

  const classify = (text: string, direction: "input" | "output"): MaybeAsync<ModerationResult> =>
    deps.classifier ? runClassifier(deps.classifier, text, direction) : { action: "allow" };

  const runClassifier = async (classifier: ModerationProvider, text: string, direction: "input" | "output"): Promise<ModerationResult> => {
    let verdict;
    try {
      verdict = await classifier.classify(text, direction);
    } catch {
      // El clasificador configurado falló: se corta (cerrar es más seguro que dejar pasar sin la capa).
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
