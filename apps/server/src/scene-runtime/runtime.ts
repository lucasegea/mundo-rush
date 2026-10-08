// scene-runtime (03 §4.2): orquesta UNA escena por conexión con la máquina de @lg/core/scene. Ejecuta los efectos que
// la máquina devuelve (siempre con el estado destino ya vigente), dispara los temporizadores (softCap, hardCap,
// turnTimer: el servidor manda, D-130), llama al NPC (modelo de texto) y al observador, evalúa criterios y, al cerrar,
// emite los efectos de misión y la evidencia (EvidenceStore). F4.1 es solo texto: los "terminé de decir la línea" que
// en voz manda el cliente acá los da el propio runtime apenas envía el texto.
// Nunca envía al cliente un prompt, un nombre de modelo ni una clave (A4): todo sale por mensajes del protocolo, que
// son objetos estrictos, y `send` valida cada uno antes de mandarlo.
import { randomUUID } from "node:crypto";
import {
  applyCriteriaReports, criteriaSatisfied, emptyCriteria, initialSceneSnapshot, metCriteriaIds, resolveScene,
  sceneCloseEffects, sceneTransition,
  type CriteriaState, type CriterionDef, type SceneEffect, type SceneEvent, type SceneSnapshot, type SceneStateName,
} from "@lg/core/scene";
import type { Clock } from "@lg/core";
import {
  ClientMessageSchema, ServerMessageSchema,
  type ClientMessage, type EvidenceEvent, type ServerMessage,
} from "@lg/protocol";
import type { Escena, LineaGuionada, Mision, Npc } from "@lg/content-schema";
import type { ServerContent } from "../content/loader.ts";
import type { ModelsConfig } from "../config/models.ts";
import { runObserver } from "../observer/observer.ts";
import type { TextModelProvider, TextTurn } from "../providers/text.ts";
import type { EvidenceStore } from "../store/evidence.ts";
import { createModerator, type ModerationResult, type Moderator } from "../moderation/moderation.ts";
import type { ModerationProvider } from "../providers/moderation.ts";
import { createMemorySafetyStore, type SafetyEventStore } from "../store/safety.ts";
import { applies, exitLines, isNpcLine, openingLines, readCatalog, renderScriptedText, type Catalog } from "./catalog.ts";
import { foldProgress, type OperatorProgress } from "./progress.ts";
import { buildNpcPrompt } from "./prompt.ts";

/** Línea guionada de un NPC que pide presentación y nadie lo presentó (02 §1.7). */
export const NOT_INTRODUCED_LINE = "Hi! Do I know you?";

/** Notas [DIRECTOR] de "Pasar el turno" (03 §5.5.3): el modelo nunca las dice en voz alta. */
const DIRECTOR_NOTES = {
  simpler: "[DIRECTOR] The player asked for something simpler: rephrase your last line with fewer words and offer two options.",
  continue: "[DIRECTOR] Continue the conversation without waiting for an answer; give the player an easy yes/no question.",
} as const;
const SCENE_START_NOTE = "[DIRECTOR] The scene starts now.";

export interface Scheduler {
  /** Programa `fn` en `ms`; devuelve la cancelación. */
  schedule(ms: number, fn: () => void): () => void;
}

export const realScheduler: Scheduler = {
  schedule(ms, fn) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export interface SceneDeps {
  /** Contenido para la escena que arranca (loader.forNextScene: el modo director relee entre escenas). */
  content: () => ServerContent;
  npcModel: TextModelProvider;
  observerModel: TextModelProvider;
  models: ModelsConfig;
  evidence: EvidenceStore;
  accountId: string;
  clock: Clock;
  scheduler?: Scheduler;
  newId?: () => string;
  /** Clasificador de moderación (F4.2, 03 §7.7). null o ausente: la capa no corre; las listas y reglas sí. */
  moderation?: ModerationProvider | null;
  /** safety_events (D-112). Sin él, en memoria. */
  safety?: SafetyEventStore;
}

export interface SceneSession {
  /** Un mensaje crudo del cliente (ya parseado como JSON). Resuelve cuando la escena quedó quieta. */
  receive(raw: unknown): Promise<void>;
  /** La conexión se cerró: una escena activa se aborta (se reanuda desde su inicio, 03 §3.5.1). */
  close(): void;
  readonly snapshot: SceneSnapshot;
  /** Espera a que terminen las llamadas en curso (NPC y observador). */
  settled(): Promise<void>;
}

interface TranscriptEntry {
  speaker: "player" | "npc";
  text: string;
}

interface Run {
  catalog: Catalog;
  mission: Mision;
  scene: Escena;
  npc: Npc | null;
  sceneRunId: string;
  progress: OperatorProgress;
  system: string | null;
  openingTurn: string | null;
  criteriaDefs: CriterionDef[];
  criteria: CriteriaState;
  transcript: TranscriptEntry[];
  evidence: EvidenceEvent[];
  lastNpcLine: string | null;
  pendingText: string | null;
  /** Sube al cerrar la sesión: una respuesta en vuelo de una generación vieja se descarta. */
  generation: number;
  cancelCaps: (() => void)[];
  cancelTurnTimer: (() => void) | null;
  moderator: Moderator;
}

/** En modo texto el runtime da por terminada la línea de cada estado apenas la manda. */
const AUTO_DONE: Partial<Record<SceneStateName, SceneEvent>> = {
  npcOpening: { type: "openingDone" },
  signal: { type: "companionDone" },
  nonConverging: { type: "nonConvergingDone" },
  containment: { type: "containmentDone" },
  closing: { type: "closingDone" },
  posttask: { type: "posttaskDone" },
};

const ACTIVE_RUN: readonly SceneStateName[] = ["pretask", "npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging", "closing", "posttask", "containment"];

export function createSceneSession(deps: SceneDeps, sendRaw: (msg: ServerMessage) => void): SceneSession {
  const scheduler = deps.scheduler ?? realScheduler;
  const newId = deps.newId ?? (() => randomUUID());
  const iso = (): string => new Date(deps.clock.now()).toISOString();
  let snap: SceneSnapshot = initialSceneSnapshot();
  let run: Run | null = null;
  const queue: SceneEvent[] = [];
  let draining = false;
  const pending = new Set<Promise<void>>();
  const safetyStore = deps.safety ?? createMemorySafetyStore();

  /** Todo mensaje pasa por el esquema estricto: lo que no está en el protocolo no sale (A4). */
  const send = (msg: ServerMessage): void => sendRaw(ServerMessageSchema.parse(msg));
  const fail = (code: Extract<ServerMessage, { type: "error" }>["code"], message: string): void => send({ type: "error", code, message });

  const sendState = (): void => send({
    type: "scene.state", state: snap.state, sub: snap.sub, modality: snap.ctx.modality,
    turnIndex: snap.ctx.turnIndex, softCapReached: snap.ctx.softCapReached,
  });

  const sendLines = (r: Run, lines: readonly LineaGuionada[], kind: "pretask" | "opening" | "closing" | "exit"): void => {
    for (const l of lines) {
      if (isNpcLine(l)) {
        // El servidor todavía no conoce el nombre de juego (llega con el onboarding): los huecos se dicen sin él.
        const text = renderScriptedText(l.en, null);
        send({ type: "npc.line", line: { lineId: newId(), speaker: l.quien, kind, text, template: null } });
        if (r.npc && l.quien === r.npc.id) r.lastNpcLine = text;
      } else {
        send({ type: "npc.line", line: { lineId: newId(), speaker: "LUMI", kind, text: null, template: l.plantilla } });
      }
    }
  };

  const appendEvidence = (r: Run, event: Omit<EvidenceEvent, "id" | "accountId" | "at" | "missionId" | "sceneId">): EvidenceEvent => {
    const full: EvidenceEvent = { id: newId(), accountId: deps.accountId, at: iso(), missionId: r.mission.id, sceneId: r.scene.escena_id, ...event };
    deps.evidence.append(full);
    r.evidence.push(full);
    return full;
  };

  const track = (p: Promise<void>): void => {
    const done = p.finally(() => pending.delete(done));
    pending.add(done);
  };

  // ---------- turno del NPC (texto) ----------

  const modelTurns = (r: Run, note: string | null): TextTurn[] => {
    const raw: TextTurn[] = [{ role: "user", text: SCENE_START_NOTE }];
    if (r.openingTurn) raw.push({ role: "model", text: r.openingTurn });
    for (const t of r.transcript) raw.push({ role: t.speaker === "player" ? "user" : "model", text: t.text });
    if (note) raw.push({ role: "user", text: note });
    // Turnos seguidos del mismo rol se juntan (el proveedor alterna usuario/modelo).
    return raw.reduce<TextTurn[]>((acc, t) => {
      const last = acc[acc.length - 1];
      if (last && last.role === t.role) acc[acc.length - 1] = { role: t.role, text: `${last.text}\n${t.text}` };
      else acc.push(t);
      return acc;
    }, []);
  };

  const stillOn = (r: Run, gen: number, turn: number): boolean =>
    run === r && r.generation === gen && snap.state === "npcTurn" && snap.ctx.turnIndex === turn;

  /**
   * Corte o contención por moderación (03 §7.7): queda el safety_event (sin el texto) y el cliente lo sabe por
   * `scene.safety`. En un corte el NPC dice la línea segura guionada (en una escena sin NPC no se dice nada: Lumi solo
   * habla por plantillas) y el turno sigue; en contención la máquina pasa a `containment`.
   */
  function safetyStop(r: Run, verdict: Exclude<ModerationResult, { action: "allow" }>): void {
    safetyStore.append({
      id: newId(), accountId: deps.accountId, at: iso(), sceneRunId: r.sceneRunId, missionId: r.mission.id,
      sceneId: r.scene.escena_id, layer: verdict.layer, action: verdict.action, category: verdict.category, visibility: "operator",
    });
    send({ type: "scene.safety", layer: verdict.layer, action: verdict.action });
    if (verdict.action === "containment") return dispatch({ type: "safetyRisk" });
    if (r.npc) {
      const text = r.catalog.safety.containment.linea_segura_en;
      send({ type: "npc.line", line: { lineId: newId(), speaker: r.npc.id, kind: "safe", text, template: null } });
      r.transcript.push({ speaker: "npc", text });
      r.lastNpcLine = text;
    }
    dispatch({ type: "npcDone" });
  }

  async function processTurn(r: Run, playerText: string | null, note: "simpler" | "continue" | null): Promise<void> {
    const gen = r.generation;
    const turn = snap.ctx.turnIndex;
    const role = deps.models.roles;
    const structures = [...r.mission.lenguaje_objetivo.estructuras, ...r.mission.lenguaje_objetivo.chunks];
    // Modo texto: la entrada se modera ANTES de llegar al modelo o al observador (03 §7.7 punto 2).
    if (playerText !== null) {
      // Sin clasificador la decisión es síncrona: el modelo se llama en el mismo tick (como en F4.1).
      const pendingInput = r.moderator.checkInput(playerText);
      const input = pendingInput instanceof Promise ? await pendingInput : pendingInput;
      if (!stillOn(r, gen, turn)) return;
      if (input.action !== "allow") return safetyStop(r, input);
      r.transcript.push({ speaker: "player", text: playerText });
    }
    // El observador corre mientras el NPC responde (03 §5.6); la decisión se toma con los dos resultados.
    const observing = playerText === null ? Promise.resolve(null) : runObserver(deps.observerModel, {
      turnId: `${r.sceneRunId}:${turn}`, playerText, lastNpcLine: r.lastNpcLine,
      criteria: r.scene.criterios_exito, structures, cefrBand: r.scene.banda,
    }, role.observer);
    const replying: Promise<{ text: string } | { error: string } | null> = r.npc && r.system
      ? deps.npcModel.generate({
        system: r.system, turns: modelTurns(r, note ? DIRECTOR_NOTES[note] : null),
        json: false, maxOutputTokens: role.textNpc.maxOutputTokens, timeoutMs: role.textNpc.timeoutMs,
      }).then((res) => ({ text: res.text }), (err: unknown) => ({ error: err instanceof Error ? err.message : "error" }))
      : Promise.resolve(null);

    const obs = await observing;
    if (!stillOn(r, gen, turn)) return;
    if (obs?.ok) {
      // El observador también es una capa de seguridad, y su veredicto gana siempre sobre los criterios: un turno
      // marcado no cumple la escena, no deja evidencia (ni cita) y no recibe la respuesta del modelo.
      if (obs.result.safety === "risk") return safetyStop(r, { action: "containment", layer: "observer", category: "observador" });
      if (obs.result.safety === "inappropriate") {
        await replying;
        if (!stillOn(r, gen, turn)) return;
        return safetyStop(r, { action: "cut", layer: "observer", category: "observador" });
      }
      const update = applyCriteriaReports(r.criteriaDefs, r.criteria, obs.result.criteria);
      r.criteria = update.state;
      for (const ev of obs.result.evidence) {
        if (structures.includes(ev.structureId)) appendEvidence(r, { kind: ev.kind, structureId: ev.structureId, branch: ev.branch, quote: ev.quote });
      }
      if (criteriaSatisfied(r.criteriaDefs, r.criteria)) return dispatch({ type: "criteriaMet" });
    } else if (obs) {
      send({ type: "scene.notice", code: "observer_invalid", message: "El observador no devolvió un resultado válido; el turno sigue sin evaluar." });
    }
    const reply = await replying;
    if (!stillOn(r, gen, turn)) return;
    if (reply && "text" in reply) {
      // Salida en texto: moderación síncrona y completa antes de mostrar (03 §7.7 punto 4).
      const output = await r.moderator.checkOutput(reply.text, r.npc?.id ?? "LUMI");
      if (!stillOn(r, gen, turn)) return;
      if (output.action !== "allow") return safetyStop(r, { ...output, action: "cut" });
      send({ type: "npc.line", line: { lineId: newId(), speaker: r.npc?.id ?? "LUMI", kind: "reply", text: reply.text, template: null } });
      r.transcript.push({ speaker: "npc", text: reply.text });
      r.lastNpcLine = reply.text;
    } else if (reply) {
      send({ type: "scene.notice", code: "model_unavailable", message: "El NPC no pudo responder (modelo no disponible)." });
    }
    dispatch({ type: "npcDone" });
  }

  // ---------- efectos ----------

  const finish = (r: Run, outcome: "success" | "partial" | "hardCap" | "containment"): void => {
    const criteriaMet = metCriteriaIds(r.criteriaDefs, r.criteria);
    if (outcome !== "containment") {
      // Cerrar sin criterios (no converge / tope duro) igual deja el mundo como dice la ficha (salida_si_no_converge):
      // el jugador nunca "pierde" la escena (02 §3.2 G3; invariante d).
      const effects = sceneCloseEffects(r.mission, r.scene.escena_id, r.progress.story);
      appendEvidence(r, { kind: "mission_outcome", outcome, effects, criteriaMet });
      send({ type: "scene.effects", missionId: r.mission.id, sceneId: r.scene.escena_id, effects });
    }
    send({ type: "scene.end", outcome, criteriaMet, evidence: r.evidence });
  };

  function runEffect(r: Run, eff: SceneEffect): void {
    switch (eff.type) {
      case "openSession":
        queue.push({ type: "sceneReady" }); // texto: no hay sesión Live que precalentar
        return;
      case "startPretask": {
        const pre = applies(r.mission.pre_tarea);
        if (pre) send({ type: "npc.line", line: { lineId: newId(), speaker: "LUMI", kind: "pretask", text: null, template: pre.plantilla } });
        queue.push({ type: "pretaskDone" });
        return;
      }
      case "startClock": {
        const { softCapMs, hardCapMs } = deps.models.scene;
        r.cancelCaps = [
          scheduler.schedule(softCapMs, () => dispatch({ type: "softCap" })),
          scheduler.schedule(hardCapMs, () => dispatch({ type: "hardCap" })),
        ];
        return;
      }
      case "stopClock":
        r.cancelCaps.forEach((c) => c());
        r.cancelCaps = [];
        return;
      case "emitLine":
        if (eff.line === "opening") sendLines(r, openingLines(r.scene), "opening");
        else if (eff.line === "closing") sendLines(r, r.scene.cierre_guionado, "closing");
        else if (eff.line === "exit") sendLines(r, exitLines(r.scene), "exit");
        else {
          // Contención (D-112): línea fuera de la ficción + recurso de ayuda local; textos provisorios hasta F13.
          const c = r.catalog.safety.containment;
          const resource = c.recursos[c.pais_por_defecto];
          send({ type: "scene.notice", code: "containment", message: "Escena detenida por seguridad." });
          send({
            type: "scene.containment", line: c.contencion_es,
            resource: resource ? { label: resource.etiqueta, detail: resource.detalle } : null, provisional: c.estado !== "revisado",
          });
        }
        return;
      case "startTurnTimer":
        r.cancelTurnTimer = scheduler.schedule(deps.models.scene.turnTimerMs, () => dispatch({ type: "turnTimer" }));
        return;
      case "cancelTurnTimer":
        r.cancelTurnTimer?.();
        r.cancelTurnTimer = null;
        return;
      case "commitTurn":
        // El texto entra al transcripto recién después de la moderación de entrada (processTurn): un turno cortado
        // nunca llega al modelo. Si el commit es por el tope duro, la escena cierra y el texto no se usa.
        return;
      case "requestNpcReply": {
        const text = r.pendingText;
        r.pendingText = null;
        track(processTurn(r, text, eff.directorNote));
        return;
      }
      case "closeSession":
        r.generation++; // lo que esté en vuelo ya no habla (invariante e)
        return;
      case "sceneEnded":
        finish(r, eff.outcome);
        return;
      case "sceneAborted":
        send({ type: "scene.end", outcome: "aborted", criteriaMet: [], evidence: r.evidence });
        return;
      // Sin efecto en texto en F4.1: Lumi (F6), audio (F5) y el menú de pase (lo muestra el cliente por scene.state).
      case "showPassMenu":
      case "passOption":
      case "companionSignal":
      case "cutAudio":
      case "modalityChanged":
      case "posttask":
        return;
    }
  }

  function dispatch(ev: SceneEvent): void {
    queue.push(ev);
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const next = queue.shift() as SceneEvent;
        const r = run;
        if (!r) continue;
        const prev = snap.state;
        const t = sceneTransition(snap, next);
        if (!t.changed) continue;
        snap = t.snapshot;
        sendState();
        for (const eff of t.effects) runEffect(r, eff);
        const auto = AUTO_DONE[snap.state];
        if (auto && snap.state !== prev && snap.ctx.modality === "text") queue.push(auto);
      }
    } finally {
      draining = false;
    }
  }

  // ---------- mensajes del cliente ----------

  function start(npcId: string | null): void {
    if (run && ACTIVE_RUN.includes(snap.state)) return fail("scene_busy", "Ya hay una escena en curso.");
    const catalog = readCatalog(deps.content());
    const npc = npcId === null ? null : catalog.npc(npcId) ?? null;
    if (npcId !== null && !npc) return fail("unknown_npc", "No existe ese NPC.");
    const progress = foldProgress(deps.evidence.list(deps.accountId), catalog);
    const res = resolveScene(catalog.missions, npc, progress.story);
    if (res.kind === "notIntroduced") {
      send({ type: "npc.line", line: { lineId: newId(), speaker: res.npcId, kind: "notIntroduced", text: NOT_INTRODUCED_LINE, template: null } });
      return send({ type: "scene.blocked", npcId: res.npcId, reason: "notIntroduced" });
    }
    const mission = res.kind === "scene" ? catalog.mission(res.missionId) : undefined;
    const scene = res.kind === "scene" ? catalog.scene(res.missionId, res.sceneId) : undefined;
    if (!mission || !scene) return send({ type: "scene.blocked", npcId, reason: "noScene" });
    const intro = npc ? catalog.introOf(npc.id) : undefined;
    const built = npc ? buildNpcPrompt({
      catalog, npc, scene, world: progress.world,
      introducedBy: intro && progress.story.intros.includes(npc.id) ? intro.presentado_por : null,
    }) : null;
    run = {
      catalog, mission, scene, npc, sceneRunId: newId(), progress,
      system: built?.system ?? null, openingTurn: built?.openingAsModelTurn ?? null,
      criteriaDefs: scene.criterios_exito.map((c) => ({ id: c.id, optional: c.opcional })),
      criteria: emptyCriteria(), transcript: [], evidence: [], lastNpcLine: null, pendingText: null,
      generation: 0, cancelCaps: [], cancelTurnTimer: null,
      moderator: createModerator({ lists: catalog.safety.lists, classifier: deps.moderation ?? null }),
    };
    snap = initialSceneSnapshot();
    send({ type: "scene.opened", sceneRunId: run.sceneRunId, missionId: mission.id, sceneId: scene.escena_id, npcId, modality: "text" });
    dispatch({ type: "interact", npcId, sceneId: scene.escena_id, modality: "text" });
  }

  function handle(msg: ClientMessage): void {
    switch (msg.type) {
      case "scene.start":
        return start(msg.npcId);
      case "turn.text": {
        if (!run || snap.state !== "playerTurn" || (snap.sub !== "waiting" && snap.sub !== "speaking" && snap.sub !== "endPending")) {
          return fail("not_your_turn", "No es tu turno.");
        }
        run.pendingText = msg.text;
        if (snap.sub === "waiting") dispatch({ type: "speechStart" });
        if (snap.sub === "speaking") dispatch({ type: "speechPause" });
        return dispatch({ type: "pressDone" });
      }
      case "turn.pass":
        if (!run || snap.state !== "playerTurn" || (snap.sub !== "waiting" && snap.sub !== "endPending")) return fail("not_your_turn", "No es tu turno.");
        return dispatch({ type: "pressPass" });
      case "turn.choose":
        if (!run || snap.state !== "playerTurn" || snap.sub !== "passMenu") return fail("not_your_turn", "No hay menú abierto.");
        return dispatch({ type: "choose", option: msg.option });
      case "scene.abort":
        return dispatch({ type: "abort" });
      case "voice.turnStart":
      case "voice.turnEnd":
        return fail("not_implemented", "La voz llega en F5.");
    }
  }

  const settled = async (): Promise<void> => {
    while (pending.size > 0) await Promise.all([...pending]);
  };

  return {
    async receive(raw) {
      const parsed = ClientMessageSchema.safeParse(raw);
      if (!parsed.success) return fail("bad_message", "Mensaje inválido.");
      handle(parsed.data);
      await settled();
    },
    close() {
      if (run && ACTIVE_RUN.includes(snap.state)) dispatch({ type: "abort" });
      if (run) {
        run.cancelCaps.forEach((c) => c());
        run.cancelTurnTimer?.();
        run.generation++;
      }
    },
    get snapshot() {
      return snap;
    },
    settled,
  };
}
