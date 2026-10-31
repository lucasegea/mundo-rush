// SafetyEventStore (03 §7.4 `safety_events`, §7.7; D-112, D-157): append-only record of moderation cuts and
// containments. Interface + in-memory adapter (tests) + file adapter (apps/server/data/safety.jsonl,
// gitignored). Minimization (03 §7.3): it never stores the cut text or the term that triggered it; only the layer, the
// action, the category and the scene. Visibility per policy: in operator mode (D-135, D-158) only the operator sees it.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SAFETY_LAYERS } from "@lg/protocol";
import { assertNoBinary } from "./evidence.ts";

export const DEFAULT_SAFETY_PATH = fileURLToPath(new URL("../../data/safety.jsonl", import.meta.url));

/** Categories: the list rule that fired, a code rule, the classifier or the observer. */
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
  /** Visibility per policy (D-112): in operator mode, only the operator. */
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

/** File adapter: one JSON line per event. Lines that don't validate (cut off) are skipped on reading. */
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
