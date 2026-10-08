// SafetyEventStore (03 §7.4 `safety_events`, §7.7; D-112, D-157): registro append-only de cortes de moderación y
// contenciones. Interfaz + adaptador en memoria (tests) + adaptador de archivo (apps/server/data/safety.jsonl,
// gitignored). Minimización (03 §7.3): nunca guarda el texto cortado ni el término que disparó; solo la capa, la
// acción, la categoría y la escena. Visibilidad según política: en modo operador (D-135, D-158) la ve solo el operador.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SAFETY_LAYERS } from "@lg/protocol";
import { assertNoBinary } from "./evidence.ts";

export const DEFAULT_SAFETY_PATH = fileURLToPath(new URL("../../data/safety.jsonl", import.meta.url));

/** Categorías: la regla de la lista que disparó, una regla de código, el clasificador o el observador. */
export const SAFETY_CATEGORIES = [
  "riesgo", "inapropiado", "apelativos", "correccion_explicita", "dinero", "salud", "nombres_reales", "lumi",
  "datos_personales", "clasificador", "clasificador_error", "observador",
] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

export const SafetyEventSchema = z.strictObject({
  id: z.string().min(1),
  accountId: z.string().min(1),
  at: z.iso.datetime(),
  sceneRunId: z.string().min(1),
  missionId: z.string().min(1),
  sceneId: z.string().min(1),
  layer: z.enum(SAFETY_LAYERS),
  action: z.enum(["cut", "containment"]),
  category: z.enum(SAFETY_CATEGORIES),
  /** Visibilidad según política (D-112): en modo operador, solo el operador. */
  visibility: z.enum(["operator"]),
});
export type SafetyEvent = z.infer<typeof SafetyEventSchema>;

export interface SafetyEventStore {
  append(event: SafetyEvent): void;
  list(accountId: string): SafetyEvent[];
}

const checked = (event: SafetyEvent): SafetyEvent => {
  assertNoBinary(event);
  return SafetyEventSchema.parse(event);
};

export function createMemorySafetyStore(): SafetyEventStore {
  const events: SafetyEvent[] = [];
  return {
    append(event) {
      events.push(checked(event));
    },
    list: (accountId) => events.filter((e) => e.accountId === accountId),
  };
}

/** Adaptador de archivo: una línea JSON por evento. Las líneas que no validan (cortadas) se saltean al leer. */
export function createFileSafetyStore(path: string = DEFAULT_SAFETY_PATH): SafetyEventStore {
  const read = (): SafetyEvent[] => {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8").split("\n").flatMap((line) => {
      if (line.trim() === "") return [];
      try {
        const p = SafetyEventSchema.safeParse(JSON.parse(line));
        return p.success ? [p.data] : [];
      } catch {
        return [];
      }
    });
  };
  return {
    append(event) {
      const ok = checked(event);
      mkdirSync(dirname(path), { recursive: true });
      const prev = existsSync(path) ? readFileSync(path, "utf8") : "";
      appendFileSync(path, `${prev === "" || prev.endsWith("\n") ? "" : "\n"}${JSON.stringify(ok)}\n`, "utf8");
    },
    list: (accountId) => read().filter((e) => e.accountId === accountId),
  };
}
