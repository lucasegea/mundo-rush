// state/actions.ts — barril de acciones públicas: lo único que ui/ (y dev/director) despachan (R14, P0 T2).
// Acciones delgadas: las reglas (tiers, saneo de ajustes, fase, pila de paneles) viven en @lg/core.
import {
  applyLook, applySettingsPatch, applyWorldEffects, canEnterWorld, cellAt, cellCenter, DEFAULT_MOVEMENT, downgradeTier, effectiveTier, facingFrom,
  headingYaw, IDLE, isWalkable, nearbyInteractables, nearestWalkable, phaseAfterBoot, planPath, popPanel, prepareDiorama, pushPanel, recenterYaw,
  RUN_MOVEMENT, sameIds, screenDirToWorld, SIM_DT, standoffPoint, stepBody, stepZoomDistance, suggestTier, THIRD_PERSON, zoomDistanceAt, zoomTAt,
  type Capabilities, type Settings, type DioramaLayout, type FeedbackMode, type MoveIntent, type NpcSpeed, type Panel,
  type SemanticAction, type SettingsPatch, type TextScale, type TierChoice, type WorldEffect,
} from "@lg/core";
import type { ServerMessage } from "@lg/protocol";
import { gameStore, type GameState, type GameStore } from "./store";
import { freshScene, initialCamera, type CameraState, type DialogueLine, type DialogueState, type Lexicon, type NpcInfo, type PlaceInfo, type VoiceUi } from "./slices";
import { selectMapActive } from "./selectors/world";

export interface DialogOnlyCatalog {
  regionName: string;
  places: PlaceInfo[];
  npcs: NpcInfo[];
}

/** Contenido recompilado en caliente (modo director, FD0): lo que cambió, ya parseado por services/content. */
export interface ContentUpdate {
  catalog: DialogOnlyCatalog | null;
  diorama: DioramaLayout | null;
}

type Params = Record<string, string | number>;

/** Opciones de "Pasar el turno" (03 §5.5.3). */
export type PassChoice = "hint" | "repeat" | "simpler" | "continue";

/** Largo máximo de un turno escrito (el mismo tope que valida el protocolo). */
export const MAX_TURN_CHARS = 500;

const ACTIVE_STEPS = new Set(["pretask", "npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging", "closing", "posttask", "containment"]);
const WRITABLE_SUBS = new Set(["waiting", "speaking", "endPending"]);

/** Línea del servidor → línea del historial (Lumi: solo id de plantilla). */
const lineFrom = (l: Extract<ServerMessage, { type: "npc.line" }>["line"]): DialogueLine =>
  ({ id: l.lineId, speaker: l.speaker, kind: l.kind, text: l.text, template: l.template });

/** Aplica un mensaje del servidor al slice `dialogue` (puro: lo usa la acción `sceneMessage`). */
export function reduceSceneMessage(d: DialogueState, msg: ServerMessage): DialogueState {
  switch (msg.type) {
    case "scene.opened":
      return { ...d, sceneRunId: msg.sceneRunId, missionId: msg.missionId, sceneId: msg.sceneId, npcId: msg.npcId, modality: msg.modality, outcome: null, blocked: null };
    case "scene.state":
      return {
        ...d, state: msg.state, turnSubstate: msg.sub, turnIndex: msg.turnIndex, modality: msg.modality,
        silenceMenuOpen: msg.state === "playerTurn" && msg.sub === "passMenu",
      };
    case "npc.line": {
      const line = lineFrom(msg.line);
      const isNpcText = line.speaker !== "LUMI" && line.text !== null;
      return {
        ...d, history: [...d.history, line],
        subtitles: line.text !== null ? { final: [...d.subtitles.final, line.text], partial: null } : d.subtitles,
        lastNpcLine: isNpcText ? line.text : d.lastNpcLine,
        voice: d.voice.heard === null ? d.voice : { ...d.voice, heard: null },
      };
    }
    case "turn.transcript": {
      // F5.2: lo que el servidor oyó del jugador. Parcial: se muestra mientras habla; final: entra al historial.
      if (msg.speaker !== "player") return d;
      if (!msg.final) return { ...d, voice: { ...d.voice, heard: msg.text } };
      const text = msg.text.trim();
      const voice = { ...d.voice, heard: null, turnHint: text === "" ? ("unheard" as const) : d.voice.turnHint };
      if (text === "") return { ...d, voice };
      const line: DialogueLine = { id: `heard-${msg.turnId}`, speaker: "player", kind: "player", text, template: null };
      return { ...d, voice, history: [...d.history, line] };
    }
    case "scene.blocked":
      return { ...d, blocked: msg.reason, npcId: msg.npcId ?? d.npcId };
    case "scene.end":
      return { ...d, outcome: msg.outcome };
    case "scene.safety":
      // El turno cortado se marca en el historial (sin el texto del NPC: no se mostró).
      return msg.action === "cut" && msg.layer !== "output"
        ? { ...d, history: [...d.history, { id: `cut-${d.history.length}`, speaker: "system", kind: "cut", text: null, template: null }], voice: { ...d.voice, heard: null } }
        : d;
    case "scene.containment":
      return { ...d, containment: { line: msg.line, resource: msg.resource, provisional: msg.provisional } };
    case "scene.notice":
      return { ...d, notice: msg.code, noticeCause: msg.cause ?? null };
    case "conversation.state": {
      // A2: medidores, lo que sabés del NPC y la escalera de ayuda (el servidor decide; el cliente solo muestra).
      return {
        ...d,
        conversation: { npcName: msg.npcName, activeMeter: msg.activeMeter, meters: msg.meters, facts: msg.facts, stalled: msg.stalled, notice: msg.notice, help: msg.help, completed: msg.completed },
      };
    }
    case "scene.effects":
    case "error":
      return d;
  }
}

export function createActions(store: GameStore) {
  const get = store.getState;
  /** Aplica el cambio; un parche vacío no notifica a nadie. */
  const set = (fn: (s: GameState) => Partial<GameState>): void => {
    const patch = fn(get());
    if (Object.keys(patch).length > 0) store.setState(patch);
  };

  const announcement = (s: GameState, key: string, params: Params = {}, keyParams: Record<string, string> = {}) => ({
    seq: (s.ui.announcement?.seq ?? 0) + 1, key, params, keyParams,
  });
  const tierOf = (s: GameState) => effectiveTier(s.settings.graphics.tier, s.settings.graphics.suggestedTier);

  /** Cambia ajustes por la regla del núcleo y anuncia el cambio (aria-live). */
  const changeSettings = (patch: SettingsPatch, key: string, params: Params = {}, keyParams: Record<string, string> = {}): void =>
    set((s) => {
      const settings = applySettingsPatch(s.settings, patch);
      // Si el tier efectivo pasa a dialog-only estando en el mapa, se baja a solo-diálogo.
      const phase = s.session.phase === "world" && !canEnterWorld(effectiveTier(settings.graphics.tier, settings.graphics.suggestedTier))
        ? "dialogOnly" : s.session.phase;
      return {
        settings,
        session: phase === s.session.phase ? s.session : { ...s.session, phase },
        ui: { ...s.ui, announcement: announcement(s, key, params, keyParams) },
      };
    });

  const openPanel = (panel: Panel, openerId: string | null): void =>
    set((s) => {
      const panels = pushPanel(s.ui.panels, panel);
      if (panels.length === s.ui.panels.length) return {};
      return { ui: { ...s.ui, panels, returnFocus: [...s.ui.returnFocus, openerId] } };
    });

  /** Abre el HUD de diálogo y pide la escena al servicio (F4.2): una escena nueva arranca de cero (GDD §2.16). */
  const openScene = (s: GameState, npcId: string | null, openerId: string | null): Partial<GameState> => {
    const seq = (s.dialogue.request?.seq ?? 0) + 1;
    return {
      ui: { ...s.ui, panels: pushPanel(s.ui.panels, { kind: "scene", npcId }), returnFocus: [...s.ui.returnFocus, openerId] },
      dialogue: freshScene({ ...s.dialogue, request: { seq, npcId } }),
    };
  };

  /** Efectos de misión sobre el mundo con la regla del núcleo (03 §6.4.8); sin cambios, parche vacío. */
  const withEffects = (s: GameState, effects: readonly WorldEffect[]): Partial<GameState> => {
    const { flags, foundations, network } = s.world;
    const next = applyWorldEffects({ flags, foundations, intros: network.intros }, effects);
    if (next.flags === flags && next.foundations === foundations && next.intros === network.intros) return {};
    return { world: { ...s.world, flags: { ...next.flags }, foundations: { ...next.foundations }, network: { ...network, intros: [...next.intros] } } };
  };

  /** Deja un comando para el servicio de escena (R5: la red vive en services/). */
  const enqueue = (d: DialogueState, msg: DialogueState["outbox"][number]["msg"]): DialogueState =>
    ({ ...d, outbox: [...d.outbox, { seq: d.outboxSeq + 1, msg }], outboxSeq: d.outboxSeq + 1 });

  const canWrite = (d: DialogueState): boolean =>
    d.modality === "text" && d.state === "playerTurn" && d.turnSubstate !== null && WRITABLE_SUBS.has(d.turnSubstate);

  /** F5.2: se puede abrir un turno hablado (escena en voz, tu turno esperando, audio listo y sin turno abierto). */
  const canTalk = (d: DialogueState): boolean =>
    d.modality === "voice" && d.state === "playerTurn" && d.turnSubstate === "waiting" && d.voice.audio === "ready" && d.voice.talk === "idle";

  const withVoice = (d: DialogueState, patch: Partial<VoiceUi>): DialogueState => ({ ...d, voice: { ...d.voice, ...patch } });

  // ---------- mapa (F2) ----------

  const withIntent = (s: GameState, intent: MoveIntent): Partial<GameState> =>
    s.player.intent === intent ? {} : { player: { ...s.player, intent, path: intent.kind === "path" ? intent.waypoints.map((w) => [w.x, w.z] as [number, number]) : [] } };

  /** Caminar hasta un punto: A* + suavizado del núcleo. Si no hay camino, se dice por aria-live. */
  const walkTo = (s: GameState, x: number, z: number): Partial<GameState> => {
    const { diorama } = s.world;
    const from = s.player.position;
    if (!diorama || !from) return {};
    const waypoints = planPath(diorama.grid, from, { x, z }, DEFAULT_MOVEMENT);
    if (!waypoints) return { ui: { ...s.ui, announcement: announcement(s, "announce.unreachable") } };
    return withIntent(s, { kind: "path", waypoints });
  };

  /** Interactuar con `target` (o con el más cercano): si está al alcance, se habla; si no, se camina hasta él. */
  const interactWith = (s: GameState, target: string | null, npcOnly: boolean): Partial<GameState> => {
    const items = s.world.diorama?.interactables ?? [];
    const nearby = s.world.nearbyInteractables.filter((id) => !npcOnly || items.find((i) => i.id === id)?.kind === "npc");
    const id = target ?? nearby[0] ?? null;
    const item = items.find((i) => i.id === id);
    if (!item || (npcOnly && item.kind !== "npc")) return {};
    if (!nearby.includes(item.id)) return walkTo(s, item.x, item.z);
    if (item.kind !== "npc") return {}; // los objetos con glosario llegan con F3
    return { ...standoff(s, item), ...openScene(s, item.id, null) };
  };

  /**
   * Al empezar la charla desde el mapa el jugador se acomoda a 2,6 m del NPC, de su lado y mirándolo (plan
   * estetica-c M1 ítem 4): `position = previous` (sin interpolar un paso), celda, orientación y un tick nuevo. El
   * desplazamiento visual lo suaviza world/actors/. Los interactuables cercanos se recalculan desde la pose nueva.
   */
  const standoff = (s: GameState, npc: { x: number; z: number }): Partial<GameState> => {
    const { diorama } = s.world;
    const from = s.player.position;
    const still = { ...s.player, intent: IDLE, path: [], velocity: { x: 0, z: 0 } };
    if (!diorama || !from) return { player: still };
    const p = standoffPoint(from, npc, diorama.grid);
    const position = { x: p.x, z: p.z };
    const nearby = nearbyInteractables(position, diorama.interactables);
    return {
      player: {
        ...still, position, previous: position,
        cell: cellAt(diorama.grid, position.x, position.z) as [number, number],
        facing: facingFrom(npc.x - position.x, npc.z - position.z, s.player.facing),
        simTick: s.player.simTick + 1,
      },
      world: sameIds(nearby, s.world.nearbyInteractables) ? s.world : { ...s.world, nearbyInteractables: nearby, focusedInteractable: nearby[0] ?? null },
    };
  };

  // ---------- cámara en tercera persona (open-world-3d T4/T5, D-820, PD-5) ----------

  const withCamera = (s: GameState, patch: Partial<CameraState>): Partial<GameState> => ({ ui: { ...s.ui, camera: { ...s.ui.camera, ...patch } } });

  /** La distancia vigente: con el mapa entero, la de `fitDistance`. */
  const currentDistance = (c: CameraState): number => (c.overview ? c.fitDistance : Math.min(c.zoomDistance, c.fitDistance));

  /** Un paso de zoom continuo (+1 acerca, -1 aleja); desde el mapa entero, el primer paso sale de él. */
  const zoom = (direction: 1 | -1) => (s: GameState): Partial<GameState> => {
    const c = s.ui.camera;
    const zoomDistance = stepZoomDistance(currentDistance(c), c.fitDistance, direction);
    const overview = zoomTAt(zoomDistance, c.fitDistance) >= 1;
    if (zoomDistance === c.zoomDistance && overview === c.overview) return {};
    return withCamera(s, { zoomDistance, overview, prevZoomDistance: overview ? c.prevZoomDistance : zoomDistance });
  };

  /** V (PD-5): al mapa entero recordando la distancia, o de vuelta a ella. */
  const toggleOverview = (s: GameState): Partial<GameState> => {
    const c = s.ui.camera;
    if (!c.overview && zoomTAt(c.zoomDistance, c.fitDistance) < THIRD_PERSON.overviewToggleT) {
      return withCamera(s, { overview: true, prevZoomDistance: c.zoomDistance, zoomDistance: c.fitDistance });
    }
    return withCamera(s, { overview: false, zoomDistance: c.prevZoomDistance });
  };

  /** La intención de teclado en el mundo según el yaw vigente: moverse es relativo a la cámara (AC18). */
  const dirIntent = (dir: { x: number; y: number }, yawDeg: number): MoveIntent => {
    const w = screenDirToWorld(dir, yawDeg);
    return { kind: "dir", x: w.x, z: w.z };
  };

  /** Mirar: yaw e inclinación nuevos; si se camina con el teclado, la dirección gira con la cámara. */
  const look = (s: GameState, dx: number, dy: number): Partial<GameState> => {
    const c = s.ui.camera;
    const next = applyLook(c.yawDeg, c.pitchDeg, dx, dy);
    if (next.yawDeg === c.yawDeg && next.pitchDeg === c.pitchDeg && c.sinceLookS === 0) return {};
    const out = withCamera(s, { ...next, sinceLookS: 0 });
    const held = s.player.heldDir;
    if (s.player.intent.kind === "dir" && (held.x !== 0 || held.y !== 0)) out.player = { ...s.player, intent: dirIntent(held, next.yawDeg), path: [] };
    return out;
  };

  /** Una acción semántica (R10) aplicada al estado; fuera del mapa no hace nada. */
  const semantic = (s: GameState, a: SemanticAction): Partial<GameState> => {
    if (!selectMapActive(s)) return {};
    switch (a.type) {
      case "move": {
        const player = { ...s.player, heldDir: { x: a.dir.x, y: a.dir.y } };
        if (a.dir.x === 0 && a.dir.y === 0) return { player, ...(s.player.intent.kind === "dir" ? withIntent({ ...s, player }, IDLE) : {}) };
        // El yaw es el vivo de la cámara (D-820): antes era el fijo del preset (presetAngles), constante.
        return { player, ...withIntent({ ...s, player }, dirIntent(a.dir, s.ui.camera.yawDeg)) };
      }
      case "moveTo": return walkTo(s, a.x, a.z);
      case "interact": return interactWith(s, a.target, false);
      case "talk": return interactWith(s, null, true);
      case "cancel": return withIntent(s, IDLE);
      case "openNotebook": return { ui: { ...s.ui, announcement: announcement(s, "announce.notebookSoon") } };
      case "zoomIn": return zoom(1)(s);
      case "zoomOut": return zoom(-1)(s);
      case "look": return look(s, a.dx, a.dy);
      case "run": return a.on === s.player.running ? {} : { player: { ...s.player, running: a.on } };
      case "toggleOverview": return toggleOverview(s);
    }
  };

  /** Un paso fijo de simulación (30 Hz): mueve al jugador y recalcula los interactuables cercanos (núcleo). */
  const simulate = (s: GameState): Partial<GameState> => {
    const { diorama } = s.world;
    const pos = s.player.position;
    if (!selectMapActive(s) || !diorama || !pos) return {};
    const v = s.player.velocity;
    // Quieto y sin intención: nada cambia y nadie se entera (el store no notifica 30 veces por segundo).
    if (s.player.intent.kind === "idle" && v.x === 0 && v.z === 0 && s.player.previous === pos) return {};
    const { body, intent } = stepBody(diorama.grid, { x: pos.x, z: pos.z, vx: v.x, vz: v.z }, s.player.intent, s.player.running ? RUN_MOVEMENT : DEFAULT_MOVEMENT);
    // Si no se movió, se conserva el mismo objeto: así el próximo paso ve previous === position y no notifica.
    const position = body.x === pos.x && body.z === pos.z ? pos : { x: body.x, z: body.z };
    const nearby = nearbyInteractables(position, diorama.interactables);
    return {
      player: {
        ...s.player,
        previous: pos,
        position,
        cell: cellAt(diorama.grid, body.x, body.z) as [number, number],
        velocity: { x: body.vx, z: body.vz },
        intent,
        path: intent === s.player.intent ? s.player.path : intent.kind === "path" ? intent.waypoints.map((w) => [w.x, w.z] as [number, number]) : [],
        facing: facingFrom(body.vx, body.vz, s.player.facing),
        simTick: s.player.simTick + 1,
      },
      world: sameIds(nearby, s.world.nearbyInteractables) ? s.world : { ...s.world, nearbyInteractables: nearby, focusedInteractable: nearby[0] ?? null },
      ...recenter(s, body.vx, body.vz),
    };
  };

  /**
   * Recentrado (D-820, AC25): caminando hacia adelante (W sin lateral) o hacia un clic, desde 1,5 s después de la
   * última mirada, la cámara gira hacia la marcha a lo sumo 90°/s; nunca con "reducir movimiento". El tiempo sin mirar
   * se cuenta en pasos de simulación con movimiento (quieto, el lazo no notifica al store).
   */
  const recenter = (s: GameState, vx: number, vz: number): Partial<GameState> => {
    const c = s.ui.camera;
    const sinceLookS = c.sinceLookS + SIM_DT;
    const held = s.player.heldDir;
    const forward = s.player.intent.kind === "path" || (s.player.intent.kind === "dir" && held.x === 0 && held.y > 0);
    const moving = Math.hypot(vx, vz) > 0.2;
    const yawDeg = moving
      ? recenterYaw({
        yawDeg: c.yawDeg, headingDeg: headingYaw(vx, vz), sinceLookS, dt: SIM_DT, forward,
        reduceMotion: s.settings.accessibility.reduceMotion, t: zoomTAt(currentDistance(c), c.fitDistance),
      })
      : c.yawDeg;
    return withCamera(s, { sinceLookS, yawDeg });
  };

  /** Cámara al entrar a un mapa: la de tercera persona por defecto, o el mapa entero si el ajuste es `perspective3D`. */
  const cameraFor = (settings: Settings, fitDistance: number): CameraState => {
    const overview = settings.camera === "perspective3D";
    const c = initialCamera(overview);
    return { ...c, fitDistance, zoomDistance: overview ? fitDistance : c.zoomDistance };
  };

  return {
    announce(key: string, params: Params = {}): void {
      set((s) => ({ ui: { ...s.ui, announcement: announcement(s, key, params) } }));
    },

    /** Restaura ajustes guardados en el dispositivo (o preferencias del sistema). Sin anuncio. */
    restoreSettings(patch: SettingsPatch | null): void {
      set((s) => {
        const settings = applySettingsPatch(s.settings, patch);
        return { settings, ui: { ...s.ui, camera: cameraFor(settings, s.ui.camera.fitDistance) } };
      });
    },

    /** Fin del arranque: tier sugerido por capacidades, fase inicial y menú principal abierto. */
    bootCompleted(caps: Capabilities): void {
      set((s) => {
        const settings = applySettingsPatch(s.settings, { graphics: { suggestedTier: suggestTier(caps) } });
        const tier = effectiveTier(settings.graphics.tier, settings.graphics.suggestedTier);
        const key = !caps.webgl2 ? "announce.noWebgl" : tier === "dialog-only" ? "announce.dialogOnlyChosen" : "announce.ready";
        return {
          settings,
          session: { ...s.session, phase: phaseAfterBoot(tier) },
          // Sin WebGL se aterriza directo en solo-diálogo (§2.7.2.1); con WebGL, el menú principal elige.
          ui: caps.webgl2
            ? { ...s.ui, panels: [{ kind: "mainMenu" }], returnFocus: [null], announcement: announcement(s, key) }
            : { ...s.ui, panels: [], returnFocus: [], announcement: announcement(s, key) },
        };
      });
    },

    setTextScale: (textScale: TextScale) => changeSettings({ accessibility: { textScale } }, "announce.textScale", { value: textScale }),
    setHighContrast: (on: boolean) => changeSettings({ accessibility: { highContrast: on } }, on ? "announce.highContrast.on" : "announce.highContrast.off"),
    setReduceMotion: (on: boolean) => changeSettings({ accessibility: { reduceMotion: on } }, on ? "announce.reduceMotion.on" : "announce.reduceMotion.off"),
    setSubtitles: (on: boolean) => changeSettings({ accessibility: { subtitles: on } }, on ? "announce.subtitles.on" : "announce.subtitles.off"),
    setNpcSpeed: (npcSpeed: NpcSpeed) =>
      changeSettings({ npcSpeed }, "announce.npcSpeed", {}, { value: `settings.npcSpeed.${npcSpeed}` }),
    setFeedbackMode: (feedbackMode: FeedbackMode) =>
      changeSettings({ feedbackMode }, "announce.feedbackMode", {}, { value: `settings.feedbackMode.${feedbackMode}` }),
    setTierChoice: (tier: TierChoice) =>
      changeSettings({ graphics: { tier } }, "announce.tier", {}, { value: `settings.tier.${tier}` }),

    openMainMenu: (openerId: string | null = null) => openPanel({ kind: "mainMenu" }, openerId),
    openSettings: (openerId: string | null = null) => openPanel({ kind: "settings" }, openerId),

    /** Cierra el panel de arriba y devuelve el foco a quien lo abrió. */
    closePanel(): void {
      set((s) => {
        if (s.ui.panels.length === 0) return {};
        return {
          ui: {
            ...s.ui,
            panels: popPanel(s.ui.panels),
            returnFocus: s.ui.returnFocus.slice(0, -1),
            focusRequest: s.ui.returnFocus[s.ui.returnFocus.length - 1] ?? null,
          },
        };
      });
    },

    /** Cierra todos los paneles y muestra la vista de la fase actual. */
    closeAllPanels(): void {
      set((s) => ({ ui: { ...s.ui, panels: [], returnFocus: [], focusRequest: null } }));
    },

    enterDialogOnly(): void {
      set((s) => ({
        session: { ...s.session, phase: "dialogOnly" },
        ui: { ...s.ui, panels: [], returnFocus: [], announcement: announcement(s, "announce.enteredDialogOnly") },
      }));
    },

    /** Al mapa solo si el tier lo permite; si no, se explica por aria-live y no se cambia nada. */
    enterWorld(): void {
      set((s) => {
        if (!canEnterWorld(tierOf(s))) return { ui: { ...s.ui, announcement: announcement(s, "announce.worldUnavailable") } };
        return {
          session: { ...s.session, phase: "world" },
          ui: { ...s.ui, panels: [], returnFocus: [], announcement: announcement(s, "announce.enteredWorld") },
        };
      });
    },

    selectPlace(placeId: string | null): void {
      set((s) => ({ ui: { ...s.ui, dialogOnlyPlaceId: placeId } }));
    },

    /** Entrar a la escena con un NPC (o, con `null`, seguir la historia sin NPC: escenas de Lumi como M0.2). */
    enterScene(npcId: string | null, openerId: string | null = null): void {
      set((s) => openScene(s, npcId, openerId));
    },

    /** Salir del HUD de diálogo: el servicio cierra la conexión (el servidor aborta una escena en curso). */
    leaveScene(): void {
      set((s) => {
        const top = s.ui.panels[s.ui.panels.length - 1];
        if (top?.kind !== "scene") return {};
        return {
          ui: { ...s.ui, panels: popPanel(s.ui.panels), returnFocus: s.ui.returnFocus.slice(0, -1), focusRequest: s.ui.returnFocus[s.ui.returnFocus.length - 1] ?? null },
          dialogue: { ...freshScene(s.dialogue), request: null },
        };
      });
    },

    /** "Terminé" en modo texto: manda lo escrito y cierra el turno. Vacío o fuera de turno no manda nada y lo dice. */
    submitTurn(text: string): void {
      set((s) => {
        const clean = text.trim();
        if (!canWrite(s.dialogue)) return { ui: { ...s.ui, announcement: announcement(s, "announce.notYourTurn") } };
        if (clean.length === 0) return { ui: { ...s.ui, announcement: announcement(s, "announce.emptyTurn") } };
        const body = clean.slice(0, MAX_TURN_CHARS);
        const d = enqueue(s.dialogue, { type: "turn.text", text: body });
        const line: DialogueLine = { id: `player-${d.outboxSeq}`, speaker: "player", kind: "player", text: body, template: null };
        // Hasta que el servidor confirme, el turno queda cerrado del lado del cliente (no se manda dos veces).
        return { dialogue: { ...d, history: [...d.history, line], turnSubstate: "committed" } };
      });
    },

    /** "Pasar el turno": abre el menú de las 4 opciones (03 §5.5.3). */
    passTurn(): void {
      set((s) => {
        if (s.dialogue.state !== "playerTurn" || (s.dialogue.turnSubstate !== "waiting" && s.dialogue.turnSubstate !== "endPending")) return {};
        return { dialogue: enqueue(s.dialogue, { type: "turn.pass" }) };
      });
    },

    /** Una opción del menú de pase. `repeat` además vuelve a leer la última línea del NPC por aria-live, sin costo. */
    choosePass(option: PassChoice): void {
      set((s) => {
        if (!s.dialogue.silenceMenuOpen) return {};
        const dialogue = { ...enqueue(s.dialogue, { type: "turn.choose", option }), silenceMenuOpen: false };
        const last = s.dialogue.lastNpcLine;
        return option === "repeat" && last !== null
          ? { dialogue, ui: { ...s.ui, announcement: announcement(s, "announce.repeat", { line: last }) } }
          : { dialogue };
      });
    },

    /** Palabra fuera del glosario (o sin traducción visible): se marca para repasar, sin traducción inventada (D-068). */
    markForReview(word: string): void {
      set((s) => {
        const w = word.trim().toLowerCase();
        if (w === "") return {};
        const marked = s.learner.marked.includes(w) ? s.learner.marked : [...s.learner.marked, w];
        return { learner: { ...s.learner, marked }, ui: { ...s.ui, announcement: announcement(s, "announce.marked", { word: w }) } };
      });
    },

    setHintChip: (on: boolean) => changeSettings({ input: { hintChip: on } }, on ? "announce.hintChip.on" : "announce.hintChip.off"),

    // ---------- voz (F5.2): la UI pide, services/audio ejecuta ----------

    /** "Hablar": abre el turno hablado (voice.turnStart). Fuera de turno o con el NPC sonando, no hace nada y lo dice. */
    voiceTalkStart(): void {
      set((s) => {
        if (!canTalk(s.dialogue)) return s.dialogue.voice.talk === "idle" ? { ui: { ...s.ui, announcement: announcement(s, "announce.notYourTurn") } } : {};
        const d = enqueue(s.dialogue, { type: "voice.turnStart" });
        return { dialogue: withVoice(d, { talk: "talking", heard: null, turnHint: null }) };
      });
    },

    /** "Terminé" o soltar "Hablar": el turno se cierra (services/audio manda el fin después de una cola corta de audio). */
    voiceTalkEnd(): void {
      set((s) => (s.dialogue.voice.talk === "talking" ? { dialogue: withVoice(s.dialogue, { talk: "ending" }) } : {}));
    },

    /**
     * services/audio terminó de mandar el audio del turno: voice.turnEnd al servidor. `heardSpeech`: el VAD local
     * detectó voz (si no, el HUD sugiere revisar el micrófono). Con `send: false` el turno se descarta sin mandar el fin
     * (la escena ya no está en tu turno, p. ej. por el tope de tiempo).
     */
    voiceTurnClosed(heardSpeech: boolean, send = true): void {
      set((s) => {
        if (s.dialogue.voice.talk === "idle") return {};
        const d = send ? enqueue(s.dialogue, { type: "voice.turnEnd" }) : s.dialogue;
        return { dialogue: withVoice(d, { talk: "idle", turnHint: heardSpeech ? null : "silent" }) };
      });
    },

    /** services/audio informa su estado, el nivel del micrófono o por qué no hay micrófono. */
    audioChanged(patch: Partial<Pick<VoiceUi, "audio" | "micProblem" | "level">>): void {
      set((s) => {
        const v = s.dialogue.voice;
        const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => patch[k] !== v[k]);
        return changed ? { dialogue: withVoice(s.dialogue, patch) } : {};
      });
    },

    // ---------- servicio de escena (services/scene) ----------

    sceneConnecting(): void {
      set((s) => ({ dialogue: { ...s.dialogue, connection: "connecting" } }));
    },
    sceneConnected(): void {
      set((s) => ({ dialogue: { ...s.dialogue, connection: "open" } }));
    },
    /** Falla clara: sin servidor de escenas no hay diálogo; se dice en el HUD y por aria-live. */
    sceneConnectionFailed(): void {
      set((s) => ({ dialogue: { ...s.dialogue, connection: "error" }, ui: { ...s.ui, announcement: announcement(s, "announce.sceneOffline") } }));
    },
    sceneConnectionClosed(): void {
      set((s) => (s.dialogue.connection === "open" ? { dialogue: { ...s.dialogue, connection: "closed" } } : {}));
    },
    /** Comandos ya mandados por el servicio (hasta `seq` inclusive). */
    outboxSent(seq: number): void {
      set((s) => (s.dialogue.outbox.length === 0 ? {} : { dialogue: { ...s.dialogue, outbox: s.dialogue.outbox.filter((o) => o.seq > seq) } }));
    },
    /** Un mensaje del servidor de escena; `scene.effects` además cambia el mundo (03 §6.4.8). */
    sceneMessage(msg: ServerMessage): void {
      set((s) => {
        const dialogue = reduceSceneMessage(s.dialogue, msg);
        const patch: Partial<GameState> = dialogue === s.dialogue ? {} : { dialogue };
        if (msg.type === "scene.effects") Object.assign(patch, withEffects(s, msg.effects));
        if (msg.type === "scene.end") patch.ui = { ...s.ui, announcement: announcement(s, `announce.sceneEnd.${msg.outcome}`) };
        if (msg.type === "scene.containment") patch.ui = { ...s.ui, announcement: announcement(s, "announce.containment") };
        return patch;
      });
    },

    lexiconLoading(): void {
      set((s) => ({ dialogue: { ...s.dialogue, lexicon: { ...s.dialogue.lexicon, status: "loading" } } }));
    },
    lexiconLoaded(lexicon: Omit<Lexicon, "status">): void {
      set((s) => ({ dialogue: { ...s.dialogue, lexicon: { ...lexicon, status: "ready" } } }));
    },
    /** Sin glosario el HUD sigue: tocar una palabra solo ofrece marcarla (nunca se inventa una traducción). */
    lexiconFailed(): void {
      set((s) => ({ dialogue: { ...s.dialogue, lexicon: { ...s.dialogue.lexicon, status: "error" } } }));
    },

    focusHandled(): void {
      set((s) => (s.ui.focusRequest === null ? {} : { ui: { ...s.ui, focusRequest: null } }));
    },

    contentLoading(): void {
      set((s) => ({ world: { ...s.world, catalog: "loading" } }));
    },

    contentLoaded(catalog: DialogOnlyCatalog): void {
      set((s) => ({
        world: { ...s.world, catalog: "ready", regionName: catalog.regionName, places: catalog.places, npcs: catalog.npcs },
      }));
    },

    /** Falla clara: sin contenido no hay lista; se dice por aria-live (sin datos inventados). */
    contentFailed(): void {
      set((s) => ({ world: { ...s.world, catalog: "error" }, ui: { ...s.ui, announcement: announcement(s, "announce.contentFailed") } }));
    },

    // ---------- mapa (F2) ----------
    dioramaLoading(): void {
      set((s) => ({ world: { ...s.world, dioramaStatus: "loading" } }));
    },

    /** El layout compilado entra al núcleo (grilla, capas, NPCs) y el jugador aparece en el spawn. */
    dioramaLoaded(layout: DioramaLayout): void {
      set((s) => {
        const diorama = prepareDiorama(layout);
        const position = diorama.spawn;
        const nearby = nearbyInteractables(position, diorama.interactables);
        return {
          world: {
            ...s.world, dioramaStatus: "ready", diorama, currentDiorama: diorama.id,
            loadedDioramas: s.world.loadedDioramas.includes(diorama.id) ? s.world.loadedDioramas : [...s.world.loadedDioramas, diorama.id],
            nearbyInteractables: nearby, focusedInteractable: nearby[0] ?? null,
          },
          player: {
            ...s.player, position, previous: position, cell: cellAt(diorama.grid, position.x, position.z) as [number, number],
            velocity: { x: 0, z: 0 }, intent: IDLE, path: [],
          },
          ui: { ...s.ui, camera: cameraFor(s.settings, s.ui.camera.fitDistance) },
        };
      });
    },

    dioramaFailed(): void {
      set((s) => ({ world: { ...s.world, dioramaStatus: "error" }, ui: { ...s.ui, announcement: announcement(s, "announce.mapFailed") } }));
    },

    /**
     * Recarga en caliente (FD0, 03 §6.5.2): entra el contenido recompilado. services/content solo la despacha sin
     * escena abierta (el cambio aplica en la próxima escena). Si cambió el diorama actual, el núcleo re-deriva grilla
     * y capas; el jugador se queda donde está si sigue siendo caminable; si no, pasa a la celda libre más cercana (o al
     * spawn si no hay ninguna cerca). `ids`: los tocados.
     */
    contentReloaded(ids: readonly string[], update: ContentUpdate): void {
      if (ids.length === 0) return;
      set((s) => {
        let { world, player } = s;
        if (update.catalog) {
          const c = update.catalog;
          world = { ...world, catalog: "ready", regionName: c.regionName, places: c.places, npcs: c.npcs };
        }
        if (update.diorama && update.diorama.id === world.currentDiorama) {
          const diorama = prepareDiorama(update.diorama);
          const here = player.position;
          const cell = here ? cellAt(diorama.grid, here.x, here.z) : null;
          const stays = here !== null && cell !== null && isWalkable(diorama.grid, ...cell);
          const free = cell && !stays ? nearestWalkable(diorama.grid, cell) : null;
          const position = stays ? here : free ? cellCenter(diorama.grid, ...free) : diorama.spawn;
          const nearby = nearbyInteractables(position, diorama.interactables);
          world = { ...world, diorama, nearbyInteractables: nearby, focusedInteractable: nearby[0] ?? null };
          player = stays ? player : {
            ...player, position, previous: position, cell: cellAt(diorama.grid, position.x, position.z) as [number, number],
            velocity: { x: 0, z: 0 }, intent: IDLE, path: [],
          };
        }
        return world === s.world && player === s.player ? {} : { world, player };
      });
    },

    /**
     * Efectos de misión que emitió el servidor al cerrar una escena (`scene.effects`, F4.1, 03 §6.4.8): flags,
     * fundaciones y presentaciones, con la misma regla del núcleo que usa el servidor (una fundación nunca retrocede;
     * repetir un efecto no cambia nada). El mundo 3D los refleja leyendo el store.
     */
    sceneEffectsApplied(effects: readonly WorldEffect[]): void {
      set((s) => withEffects(s, effects));
    },

    /** Única entrada de input del juego (R10): services/input y state/bridge.ts traducen dispositivos a esto. */
    dispatch(action: SemanticAction): void {
      set((s) => semantic(s, action));
    },

    move: (dir: { x: number; y: number }) => set((s) => semantic(s, { type: "move", dir })),
    moveTo: (x: number, z: number) => set((s) => semantic(s, { type: "moveTo", x, z })),
    interact: (target: string | null = null) => set((s) => semantic(s, { type: "interact", target })),
    zoomIn: () => set((s) => semantic(s, { type: "zoomIn" })),
    zoomOut: () => set((s) => semantic(s, { type: "zoomOut" })),
    toggleOverview: () => set((s) => semantic(s, { type: "toggleOverview" })),

    /**
     * Zoom a un t dado (0 = 2,5 m, 1 = el mapa entero). Lo usan la sonda de rendimiento (poses close, mid y full) y los
     * tests; el jugador usa los pasos.
     */
    zoomTo(t: number): void {
      set((s) => {
        const c = s.ui.camera;
        const overview = t >= 1;
        const zoomDistance = overview ? c.fitDistance : zoomDistanceAt(t, c.fitDistance);
        return withCamera(s, { overview, zoomDistance, prevZoomDistance: overview ? c.prevZoomDistance : zoomDistance });
      });
    },

    /**
     * world/camera avisa la distancia del mapa entero (cambia con el aspecto y el yaw). Con el mapa entero la distancia
     * la sigue; si no, la pedida nunca pasa de ella (alejar de más no acumula pasos invisibles).
     */
    cameraFitted(fitDistance: number): void {
      if (!Number.isFinite(fitDistance) || fitDistance <= THIRD_PERSON.minDistance) return;
      set((s) => {
        const c = s.ui.camera;
        if (fitDistance === c.fitDistance) return {};
        const zoomDistance = c.overview ? fitDistance : Math.min(c.zoomDistance, fitDistance);
        return withCamera(s, { fitDistance, zoomDistance });
      });
    },

    /** Un paso fijo de simulación; lo llama el lazo de services/simulation. */
    simulationStep(): void {
      set(simulate);
    },

    /**
     * PerformanceMonitor (§2.7.2.2): baja la sugerencia un escalón. Nunca con un tier fijado a mano (gana la
     * elección manual) ni durante una conversación (evita saltos visuales mientras se habla).
     */
    performanceDeclined(): void {
      set((s) => {
        if (s.settings.graphics.tier !== "auto" || s.session.phase !== "world" || s.ui.panels.some((p) => p.kind === "scene")) return {};
        const suggestedTier = downgradeTier(s.settings.graphics.suggestedTier);
        if (suggestedTier === s.settings.graphics.suggestedTier) return {};
        return {
          settings: { ...s.settings, graphics: { ...s.settings.graphics, suggestedTier } },
          ui: { ...s.ui, announcement: announcement(s, "announce.tierLowered") },
        };
      });
    },

    /** Pérdida del contexto WebGL (§2.7.2.4): a solo-diálogo sin perder nada, con aviso. */
    contextLost(): void {
      set((s) => (s.session.phase !== "world" ? {} : {
        session: { ...s.session, phase: "dialogOnly" },
        player: { ...s.player, intent: IDLE, path: [], velocity: { x: 0, z: 0 } },
        ui: { ...s.ui, panels: [], returnFocus: [], announcement: announcement(s, "announce.contextLost") },
      }));
    },
  };
}

export type GameActions = ReturnType<typeof createActions>;

/** true mientras la escena sigue viva en el servidor (03 §3.5.1, estados activos). */
export const isSceneActive = (d: DialogueState): boolean => ACTIVE_STEPS.has(d.state);

/** Las acciones del store único. */
export const actions: GameActions = createActions(gameStore);
