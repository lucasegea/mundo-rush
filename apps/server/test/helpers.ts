// Ayudas de los tests de escena: contenido real compilado en memoria (sin escribir la salida), temporizadores y reloj
// manuales, y una sesión con evidencia en memoria que junta lo que el servidor manda.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compilarContenido } from "@lg/content-schema";
import { createManualClock, type ManualClock } from "@lg/core";
import type { ServerMessage } from "@lg/protocol";
import { leerContenido } from "../../../scripts/content/build.ts";
import type { ServerContent } from "../src/content/loader.ts";
import { loadModelsConfig, type ModelsConfig } from "../src/config/models.ts";
import { createSceneSession, type Scheduler, type SceneSession } from "../src/scene-runtime/runtime.ts";
import { createMemoryEvidenceStore, type EvidenceStore } from "../src/store/evidence.ts";
import type { ModerationProvider } from "../src/providers/moderation.ts";
import { createMemorySafetyStore, type SafetyEventStore } from "../src/store/safety.ts";
import { fakeNpcModel, fakeObserverModel, observerJson, type CriteriaRule, type FakeModel } from "./fakes/text-model.ts";
import type { VoiceProviderFactory } from "../src/providers/types.ts";
import type { CostAlert, CostLedger } from "../src/cost/ledger.ts";
import type { TurnClipView } from "../src/scene-runtime/turn-clip.ts";
import type { ConversationHooks } from "../src/scene-runtime/hooks.ts";
import type { MissionReset } from "../src/scene-runtime/progress.ts";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

let cached: ServerContent | null = null;
/** El contenido real de content/, compilado en memoria (modo dev). */
/** Valor presente o falla el test con un mensaje claro (en lugar de `x!`, que el lint prohíbe). */
export function must<T>(v: T | null | undefined, what = "valor"): T {
  if (v === null || v === undefined) throw new Error(`falta ${what}`);
  return v;
}

export function realContent(): ServerContent {
  if (!cached) {
    const r = compilarContenido(leerContenido(REPO_ROOT), "dev");
    if (!r.salida) throw new Error("el contenido real no compila");
    cached = Object.freeze({ ...r.salida.servidor });
  }
  return cached;
}

export interface ManualScheduler extends Scheduler {
  /** Avanza el reloj y dispara, en orden, lo que venció. */
  advance(ms: number): void;
  readonly pendingCount: number;
}

export function manualScheduler(clock: ManualClock): ManualScheduler {
  let tasks: { at: number; fn: () => void; seq: number }[] = [];
  let seq = 0;
  return {
    schedule(ms, fn) {
      const task = { at: clock.now() + ms, fn, seq: seq++ };
      tasks.push(task);
      return () => { tasks = tasks.filter((t) => t !== task); };
    },
    advance(ms) {
      const target = clock.now() + ms;
      for (;;) {
        const due = tasks.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
        if (!due) break;
        tasks = tasks.filter((t) => t !== due);
        clock.set(Math.max(clock.now(), due.at));
        due.fn();
      }
      clock.set(target);
    },
    get pendingCount() {
      return tasks.length;
    },
  };
}

export interface Harness {
  session: SceneSession;
  sent: ServerMessage[];
  /** Audio del NPC que salió hacia el cliente (F5.1a). */
  audioOut: Int16Array[];
  /** Clips de turno creados (vista de solo lectura). */
  clips: TurnClipView[];
  alerts: CostAlert[];
  costErrors: string[];
  npc: FakeModel;
  observer: ReturnType<typeof fakeObserverModel>;
  evidence: EvidenceStore;
  safety: SafetyEventStore;
  clock: ManualClock;
  scheduler: ManualScheduler;
  models: ModelsConfig;
  /** Mensajes de un tipo. */
  of<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[];
  /** Estados por los que pasó la escena ("playerTurn.waiting"). */
  steps(): string[];
  /** Una sesión nueva sobre la misma evidencia (como una conexión nueva). */
  reconnect(): SceneSession;
}

export interface HarnessOptions {
  rules?: readonly CriteriaRule[];
  observe?: Parameters<typeof fakeObserverModel>[0];
  replies?: readonly string[];
  evidence?: EvidenceStore;
  content?: () => ServerContent;
  /** F4.2: clasificador de moderación falso y registro de safety_events. */
  moderation?: ModerationProvider;
  safety?: SafetyEventStore;
  /** F5.1a: adaptador de voz (referencia en memoria o Live contra el servidor falso), libro de costos y config. */
  voice?: VoiceProviderFactory | null;
  ledger?: CostLedger;
  models?: ModelsConfig;
  observerModel?: FakeModel & { observed: { turnId: string; playerText: string; attempt: number }[] };
  /** F5.2: ganchos de conversación. */
  conversation?: ConversationHooks;
  /** A2: reinicios de desarrollo de misiones. */
  resets?: () => readonly MissionReset[];
}

export function harness(opts: HarnessOptions = {}): Harness {
  const clock = createManualClock(Date.UTC(2026, 9, 7, 12, 0, 0));
  const scheduler = manualScheduler(clock);
  const sent: ServerMessage[] = [];
  const npc = fakeNpcModel(opts.replies);
  const observer = opts.observerModel ?? fakeObserverModel(opts.observe ?? ((call) => observerJson(call, opts.rules ?? [])));
  const evidence = opts.evidence ?? createMemoryEvidenceStore();
  const safety = opts.safety ?? createMemorySafetyStore();
  const models = opts.models ?? loadModelsConfig();
  const audioOut: Int16Array[] = [];
  const clips: TurnClipView[] = [];
  const alerts: CostAlert[] = [];
  const costErrors: string[] = [];
  let n = 0;
  const open = (): SceneSession => createSceneSession({
    content: opts.content ?? realContent, npcModel: npc, observerModel: observer, models, evidence,
    accountId: "op-local", clock, scheduler, newId: () => `id-${++n}`, safety,
    ...(opts.moderation ? { moderation: opts.moderation } : {}),
    ...(opts.voice !== undefined ? { voice: opts.voice } : {}), ...(opts.ledger ? { ledger: opts.ledger } : {}),
    ...(opts.conversation ? { conversation: opts.conversation } : {}), ...(opts.resets ? { resets: opts.resets } : {}),
    onTurnClip: (c) => clips.push(c), onCostAlert: (a) => alerts.push(a), onCostError: (m) => costErrors.push(m),
  }, (m) => sent.push(m), (pcm) => audioOut.push(pcm));
  const session = open();
  return {
    session, sent, audioOut, clips, alerts, costErrors, npc, observer, evidence, safety, clock, scheduler, models,
    of: <T extends ServerMessage["type"]>(type: T) => sent.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type),
    steps: () => sent.filter((m) => m.type === "scene.state").map((m) => (m.type === "scene.state" && m.sub ? `${m.state}.${m.sub}` : m.type === "scene.state" ? m.state : "")),
    reconnect: open,
  };
}

/** Juega una escena: abre con `npcId` y manda los turnos de texto en orden. */
export async function play(h: Harness, npcId: string | null, turns: readonly string[], session: SceneSession = h.session): Promise<void> {
  await session.receive({ type: "scene.start", npcId });
  for (const text of turns) await session.receive({ type: "turn.text", text });
}
