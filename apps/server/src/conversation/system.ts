// Meters conversation system (ADR-027): plugs into scene-runtime through the conversation hooks
// (scene-runtime/hooks.ts) and does not touch the scene machine. For each scene with `conversacion`:
//   start → loads (or revives) the encounter state, builds the NPC note and sends the state to the HUD;
//   each exchange (player turn + NPC reply, already moderated) → judge (labels) → pure engine (sum) →
//   saves → if the note changed (new phase, open level, secret), updates it → sends the state → if the
//   last meter filled, asks for closing (a game action decided by code, never by the NPC's model).
// A scene's judgments run in a queue (one at a time, in order). It never logs conversation text.
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
  /** Diagnostics for the operator. It never receives conversation text. */
  log?: (message: string) => void;
}

export interface ConversationSystem extends ConversationHooks {
  /** Waits for the judgments in progress to finish (tests). */
  settled(): Promise<void>;
}

interface Session {
  info: ConversationSceneInfo;
  control: ConversationSceneControl;
  sheet: FichaConversacion;
  def: EncounterDef;
  state: EncounterState;
  npcName: string;
  /** Player turns waiting for the NPC reply (a [DIRECTOR] note has no player turn). */
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
      // An already fulfilled encounter (e.g. the hard cap arrived before the farewell): the scene closes on the first turn.
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
        // Moderation cut the exchange: it is not judged (neither adds nor subtracts).
        s.pendingPlayer = [];
        return;
      }
      const playerText = s.pendingPlayer.join(" ").trim();
      s.pendingPlayer = [];
      const recent = s.history.slice();
      if (playerText) s.history.push({ speaker: "player", text: playerText });
      s.history.push({ speaker: "npc", text: turn.text });
      if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
      if (!playerText) return; // reply to a [DIRECTOR] note: there is no player turn to judge
      enqueue(s, () => judgeExchange(s, playerText, turn.text, recent));
    },
    onSceneEnd(end) {
      const s = sessions.get(end.sceneRunId);
      if (!s) return;
      s.ended = true;
      // The last judgment still saves the state; after that the session is released.
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
