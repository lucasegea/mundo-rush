// Sistema de conversación por medidores (ADR-027): se enchufa a scene-runtime por los ganchos de conversación
// (scene-runtime/hooks.ts) y no toca la máquina de escena. Por cada escena con `conversacion`:
//   arranque → carga (o revive) el estado del encuentro, arma la nota del NPC y manda el estado al HUD;
//   cada intercambio (turno del jugador + respuesta del NPC, ya moderados) → juez (etiquetas) → motor puro (suma) →
//   guarda → si la nota cambió (fase nueva, nivel abierto, secreto), la actualiza → manda el estado → si se llenó el
//   último medidor, pide el cierre (una acción del juego decidida por código, nunca por el modelo del NPC).
// Los juicios de una escena corren en fila (uno por vez, en orden). Nunca registra texto de la conversación.
import {
  applyExchange, encounterComplete, encounterView, initialEncounterState, reviveEncounterState,
  type EncounterDef, type EncounterState,
} from "@lg/core/conversation";
import type { FichaConversacion } from "@lg/content-schema";
import type { ConversationStateMessage } from "@lg/protocol";
import type { ModelRole } from "../config/models.ts";
import type { TextModelProvider } from "../providers/text.ts";
import type { ConversationHooks, ConversationSceneControl, ConversationSceneInfo, ConversationTurn } from "../scene-runtime/hooks.ts";
import type { EncounterStore } from "../store/encounters.ts";
import { runJudge } from "./judge.ts";
import { conversationBrief } from "./prompt.ts";
import { encounterFromSheet } from "./sheet.ts";

export interface ConversationSystemDeps {
  judge: TextModelProvider;
  role: ModelRole;
  store: EncounterStore;
  /** Diagnóstico para el operador. Nunca recibe texto de la conversación. */
  log?: (message: string) => void;
}

export interface ConversationSystem extends ConversationHooks {
  /** Espera a que terminen los juicios en curso (tests). */
  settled(): Promise<void>;
}

interface Session {
  info: ConversationSceneInfo;
  control: ConversationSceneControl;
  sheet: FichaConversacion;
  def: EncounterDef;
  state: EncounterState;
  npcName: string;
  /** Turnos del jugador que esperan la respuesta del NPC (una nota [DIRECTOR] no tiene turno del jugador). */
  pendingPlayer: string[];
  history: { speaker: "player" | "npc"; text: string }[];
  chain: Promise<void>;
  brief: string | null;
  completed: boolean;
  ended: boolean;
}

const MAX_HISTORY = 12;
const cap = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function createConversationSystem(deps: ConversationSystemDeps): ConversationSystem {
  const sessions = new Map<string, Session>();
  const pending = new Set<Promise<void>>();
  const log = (m: string): void => deps.log?.(m);

  const view = (s: Session): Omit<ConversationStateMessage, "type"> => {
    const v = encounterView(s.def, s.state);
    return {
      npcName: cap(s.npcName, 80),
      activeMeter: v.activeMeter,
      meters: v.meters.map((m) => ({ ...m, label: cap(m.label, 80) })),
      facts: v.facts.slice(0, 40).map((f) => ({ id: f.id, label: cap(f.label, 120) })),
      stalled: v.stalled,
      notice: v.notice,
      help: { level: v.help.level, hint: v.help.hint === null ? null : cap(v.help.hint, 300), phrases: v.help.phrases.slice(0, 4).map((p) => cap(p, 120)) },
      completed: s.completed,
    };
  };

  const refresh = (s: Session): void => {
    const brief = conversationBrief(s.sheet, s.state);
    if (brief !== s.brief) {
      s.brief = brief;
      s.control.setNpcBrief(brief);
    }
  };

  async function judgeExchange(s: Session, playerText: string, npcText: string, recent: Session["history"]): Promise<void> {
    const res = await runJudge(deps.judge, { sheet: s.sheet, def: s.def, state: s.state, npcName: s.npcName, playerText, npcText, recent }, deps.role);
    if (!res.ok) return log(`juez de conversación sin resultado (${s.sheet.id}, ${res.attempts} intentos): ${res.reason}; el intercambio no cuenta`);
    const { state, events } = applyExchange(s.def, s.state, res.labels);
    s.state = state;
    deps.store.put(s.info.accountId, s.sheet.id, state);
    if (s.ended) return;
    refresh(s);
    if (events.some((e) => e.type === "complete") && !s.completed) {
      s.completed = true;
      s.control.complete();
    }
    s.control.sendState(view(s));
  }

  const enqueue = (s: Session, job: () => Promise<void>): void => {
    const next = s.chain.then(job).catch((err: unknown) => log(`sistema de conversación: ${err instanceof Error ? err.message : "error"}`));
    s.chain = next;
    const done = next.finally(() => pending.delete(done));
    pending.add(done);
  };

  return {
    onSceneStart(info, control) {
      const sheet = info.conversation;
      if (!sheet) return;
      const def = encounterFromSheet(sheet);
      const state = reviveEncounterState(def, deps.store.get(info.accountId, sheet.id)) ?? initialEncounterState(def);
      const s: Session = {
        info, control, sheet, def, state, npcName: (info.npcName ?? sheet.npc).split(" ")[0] ?? sheet.npc,
        pendingPlayer: [], history: [], chain: Promise.resolve(), brief: null, completed: false, ended: false,
      };
      sessions.set(info.sceneRunId, s);
      refresh(s);
      // Un encuentro ya cumplido (p. ej. el tope duro llegó antes de la despedida): la escena cierra en el primer turno.
      if (encounterComplete(def, state)) {
        s.completed = true;
        control.complete();
      }
      control.sendState(view(s));
    },
    onTurn(turn: ConversationTurn) {
      const s = sessions.get(turn.sceneRunId);
      if (!s || !turn.final) return;
      if (turn.speaker === "player") {
        s.pendingPlayer.push(turn.text);
        return;
      }
      if (turn.kind === "safe") {
        // La moderación cortó el intercambio: no se juzga (ni suma ni resta).
        s.pendingPlayer = [];
        return;
      }
      const playerText = s.pendingPlayer.join(" ").trim();
      s.pendingPlayer = [];
      const recent = s.history.slice();
      if (playerText) s.history.push({ speaker: "player", text: playerText });
      s.history.push({ speaker: "npc", text: turn.text });
      if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
      if (!playerText) return; // respuesta a una nota [DIRECTOR]: no hay turno del jugador que juzgar
      enqueue(s, () => judgeExchange(s, playerText, turn.text, recent));
    },
    onSceneEnd(end) {
      const s = sessions.get(end.sceneRunId);
      if (!s) return;
      s.ended = true;
      // El último juicio todavía guarda el estado; después la sesión se suelta.
      enqueue(s, async () => { sessions.delete(end.sceneRunId); });
    },
    onHookError(message) {
      log(`gancho de conversación: ${message}`);
    },
    async settled() {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}
