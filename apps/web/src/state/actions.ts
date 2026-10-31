// state/actions.ts — barrel of public actions: the only thing ui/ (and dev/director) dispatch (R14, P0 T2).
// Thin actions: the rules (tiers, settings sanitizing, phase, panel stack) live in @lg/core.
import {
  applyLook, applySettingsPatch, applyWorldEffects, canEnterWorld, cellAt, cellCenter, DEFAULT_MOVEMENT, downgradeTier, effectiveTier, facingFrom,
  headingYaw, IDLE, isWalkable, markWorldEnter, nearbyInteractables, nearestWalkable, phaseAfterBoot, planPath, popPanel, prepareDiorama, pushPanel, recenterYaw,
  RUN_MOVEMENT, sameIds, screenDirToWorld, SIM_DT, standoffPoint, stepBody, stepZoomDistance, suggestTier, THIRD_PERSON, zoomDistanceAt, zoomTAt,
  type Capabilities, type Settings, type DioramaLayout, type FeedbackMode, type MoveIntent, type NpcSpeed, type Panel,
  type SemanticAction, type SettingsPatch, type TextScale, type TierChoice, type WorldEffect,
} from "@lg/core";
import type { ServerMessage } from "@lg/protocol";
import { gameStore, type GameState, type GameStore } from "./store";
import { freshScene, initialCamera, type CameraState, type DialogueLine, type DialogueState, type Lexicon, type NpcInfo, type PlaceInfo, type SceneOutcome, type VoiceUi } from "./slices";
import { selectMapActive } from "./selectors/world";

export interface DialogOnlyCatalog {
  regionName: string;
  places: PlaceInfo[];
  npcs: NpcInfo[];
}

/** Content hot-recompiled (director mode, FD0): what changed, already parsed by services/content. */
export interface ContentUpdate {
  catalog: DialogOnlyCatalog | null;
  diorama: DioramaLayout | null;
}

type Params = Record<string, string | number>;

/** Options for "Pass the turn" (03 §5.5.3). */
export type PassChoice = "hint" | "repeat" | "simpler" | "continue";

/** Maximum length of a written turn (the same cap the protocol validates). */
export const MAX_TURN_CHARS = 500;

const ACTIVE_STEPS = new Set(["pretask", "npcOpening", "playerTurn", "npcTurn", "signal", "nonConverging", "closing", "posttask", "containment"]);
const WRITABLE_SUBS = new Set(["waiting", "speaking", "endPending"]);

/** Server line → history line (Lumi: template id only). */
const lineFrom = (l: Extract<ServerMessage, { type: "npc.line" }>["line"]): DialogueLine =>
  ({ id: l.lineId, speaker: l.speaker, kind: l.kind, text: l.text, template: l.template });

/** Applies a server message to the `dialogue` slice (pure: used by the `sceneMessage` action). */
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
      // F5.2: what the server heard from the player. Partial: shown while they speak; final: goes into the history.
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
      // The cut-off turn is marked in the history (without the NPC text: it was not shown).
      return msg.action === "cut" && msg.layer !== "output"
        ? { ...d, history: [...d.history, { id: `cut-${d.history.length}`, speaker: "system", kind: "cut", text: null, template: null }], voice: { ...d.voice, heard: null } }
        : d;
    case "scene.containment":
      return { ...d, containment: { line: msg.line, resource: msg.resource, provisional: msg.provisional } };
    case "scene.notice":
      return { ...d, notice: msg.code, noticeCause: msg.cause ?? null };
    case "conversation.state": {
      // A2: meters, what you know about the NPC, and the help ladder (the server decides; the client only displays).
      return {
        ...d,
        conversation: { npcName: msg.npcName, activeMeter: msg.activeMeter, meters: msg.meters, facts: msg.facts, stalled: msg.stalled, notice: msg.notice, help: msg.help, completed: msg.completed },
      };
    }
    case "error":
      // J-2: an error before `scene.opened` means the scene will never start (unknown NPC, busy, no scene): the HUD
      // says so instead of waiting forever. Errors inside an open scene (not your turn, not voice) do not end it.
      if (d.sceneRunId !== null) return d;
      return { ...d, failure: msg.code === "unknown_npc" || msg.code === "scene_busy" || msg.code === "no_scene" ? msg.code : "other" };
    case "scene.effects":
      return d;
  }
}

/**
 * Open-world-3d T9: a successful `scene.end` adds the NPC of the open scene (`dialogue.npcId`, from `scene.opened`) to
 * `completedNpcs`. Any other ending (partial, cap, containment, cut off) or a scene without an NPC changes nothing; an NPC
 * already completed does not either (returns the same object: nobody is notified).
 */
export function withCompletedNpc(p: GameState["progression"], outcome: SceneOutcome, npcId: string | null): GameState["progression"] {
  if (outcome !== "success" || npcId === null || p.completedNpcs.includes(npcId)) return p;
  return { ...p, completedNpcs: [...p.completedNpcs, npcId] };
}

export function createActions(store: GameStore) {
  const get = store.getState;
  /** Applies the change; an empty patch notifies nobody. */
  const set = (fn: (s: GameState) => Partial<GameState>): void => {
    const patch = fn(get());
    if (Object.keys(patch).length > 0) store.setState(patch);
  };

  const announcement = (s: GameState, key: string, params: Params = {}, keyParams: Record<string, string> = {}) => ({
    seq: (s.ui.announcement?.seq ?? 0) + 1, key, params, keyParams,
  });
  const tierOf = (s: GameState) => effectiveTier(s.settings.graphics.tier, s.settings.graphics.suggestedTier);

  /** Changes settings by the core rule and announces the change (aria-live). */
  const changeSettings = (patch: SettingsPatch, key: string, params: Params = {}, keyParams: Record<string, string> = {}): void =>
    set((s) => {
      const settings = applySettingsPatch(s.settings, patch);
      // If the effective tier becomes dialog-only while on the map, it drops to dialogue-only.
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

  /** Opens the dialogue HUD and asks the service for the scene (F4.2): a new scene starts from scratch (GDD §2.16). */
  const openScene = (s: GameState, npcId: string | null, openerId: string | null): Partial<GameState> => {
    const seq = (s.dialogue.request?.seq ?? 0) + 1;
    return {
      ui: { ...s.ui, panels: pushPanel(s.ui.panels, { kind: "scene", npcId }), returnFocus: [...s.ui.returnFocus, openerId] },
      dialogue: freshScene({ ...s.dialogue, request: { seq, npcId } }),
    };
  };

  /** Mission effects on the world with the core rule (03 §6.4.8); no changes, empty patch. */
  const withEffects = (s: GameState, effects: readonly WorldEffect[]): Partial<GameState> => {
    const { flags, foundations, network } = s.world;
    const next = applyWorldEffects({ flags, foundations, intros: network.intros }, effects);
    if (next.flags === flags && next.foundations === foundations && next.intros === network.intros) return {};
    return { world: { ...s.world, flags: { ...next.flags }, foundations: { ...next.foundations }, network: { ...network, intros: [...next.intros] } } };
  };

  /** Leaves a command for the scene service (R5: the network lives in services/). */
  const enqueue = (d: DialogueState, msg: DialogueState["outbox"][number]["msg"]): DialogueState =>
    ({ ...d, outbox: [...d.outbox, { seq: d.outboxSeq + 1, msg }], outboxSeq: d.outboxSeq + 1 });

  const canWrite = (d: DialogueState): boolean =>
    d.modality === "text" && d.state === "playerTurn" && d.turnSubstate !== null && WRITABLE_SUBS.has(d.turnSubstate);

  /** F5.2: a spoken turn can be opened (voice scene, your turn waiting, audio ready and no open turn). */
  const canTalk = (d: DialogueState): boolean =>
    d.modality === "voice" && d.state === "playerTurn" && d.turnSubstate === "waiting" && d.voice.audio === "ready" && d.voice.talk === "idle";

  const withVoice = (d: DialogueState, patch: Partial<VoiceUi>): DialogueState => ({ ...d, voice: { ...d.voice, ...patch } });

  // ---------- map (F2) ----------

  const withIntent = (s: GameState, intent: MoveIntent): Partial<GameState> =>
    s.player.intent === intent ? {} : { player: { ...s.player, intent, path: intent.kind === "path" ? intent.waypoints.map((w) => [w.x, w.z] as [number, number]) : [] } };

  /** Walk to a point: A* + core smoothing. If there is no path, it is announced via aria-live. */
  const walkTo = (s: GameState, x: number, z: number): Partial<GameState> => {
    const { diorama } = s.world;
    const from = s.player.position;
    if (!diorama || !from) return {};
    const waypoints = planPath(diorama.grid, from, { x, z }, DEFAULT_MOVEMENT);
    if (!waypoints) return { ui: { ...s.ui, announcement: announcement(s, "announce.unreachable") } };
    return withIntent(s, { kind: "path", waypoints });
  };

  /** Interact with `target` (or the nearest one): if within reach, talk; otherwise walk to it. */
  const interactWith = (s: GameState, target: string | null, npcOnly: boolean): Partial<GameState> => {
    const items = s.world.diorama?.interactables ?? [];
    const nearby = s.world.nearbyInteractables.filter((id) => !npcOnly || items.find((i) => i.id === id)?.kind === "npc");
    const id = target ?? nearby[0] ?? null;
    const item = items.find((i) => i.id === id);
    if (!item || (npcOnly && item.kind !== "npc")) return {};
    if (!nearby.includes(item.id)) return walkTo(s, item.x, item.z);
    if (item.kind !== "npc") return {}; // objects with a glossary arrive with F3
    return { ...standoff(s, item), ...openScene(s, item.id, null) };
  };

  /**
   * When the conversation starts from the map the player settles 2.6 m from the NPC, on their side and facing them (plan
   * estetica-c M1 item 4): `position = previous` (no one-step interpolation), cell, orientation and a new tick. The
   * visual displacement is smoothed by world/actors/. Nearby interactables are recomputed from the new pose.
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

  // ---------- third-person camera (open-world-3d T4/T5, D-820, PD-5) ----------

  const withCamera = (s: GameState, patch: Partial<CameraState>): Partial<GameState> => ({ ui: { ...s.ui, camera: { ...s.ui.camera, ...patch } } });

  /** The current distance: with the whole map, that of `fitDistance`. */
  const currentDistance = (c: CameraState): number => (c.overview ? c.fitDistance : Math.min(c.zoomDistance, c.fitDistance));

  /** One continuous zoom step (+1 closer, -1 farther); from the whole map, the first step leaves it. */
  const zoom = (direction: 1 | -1) => (s: GameState): Partial<GameState> => {
    const c = s.ui.camera;
    const zoomDistance = stepZoomDistance(currentDistance(c), c.fitDistance, direction);
    const overview = zoomTAt(zoomDistance, c.fitDistance) >= 1;
    if (zoomDistance === c.zoomDistance && overview === c.overview) return {};
    return withCamera(s, { zoomDistance, overview, prevZoomDistance: overview ? c.prevZoomDistance : zoomDistance });
  };

  /** V (PD-5): to the whole map remembering the distance, or back to it. */
  const toggleOverview = (s: GameState): Partial<GameState> => {
    const c = s.ui.camera;
    if (!c.overview && zoomTAt(c.zoomDistance, c.fitDistance) < THIRD_PERSON.overviewToggleT) {
      return withCamera(s, { overview: true, prevZoomDistance: c.zoomDistance, zoomDistance: c.fitDistance });
    }
    return withCamera(s, { overview: false, zoomDistance: c.prevZoomDistance });
  };

  /** The keyboard intent in the world according to the current yaw: movement is camera-relative (AC18). */
  const dirIntent = (dir: { x: number; y: number }, yawDeg: number): MoveIntent => {
    const w = screenDirToWorld(dir, yawDeg);
    return { kind: "dir", x: w.x, z: w.z };
  };

  /** Look: new yaw and pitch; if walking with the keyboard, the direction turns with the camera. */
  const look = (s: GameState, dx: number, dy: number): Partial<GameState> => {
    const c = s.ui.camera;
    const next = applyLook(c.yawDeg, c.pitchDeg, dx, dy);
    if (next.yawDeg === c.yawDeg && next.pitchDeg === c.pitchDeg && c.sinceLookS === 0) return {};
    const out = withCamera(s, { ...next, sinceLookS: 0 });
    const held = s.player.heldDir;
    if (s.player.intent.kind === "dir" && (held.x !== 0 || held.y !== 0)) out.player = { ...s.player, intent: dirIntent(held, next.yawDeg), path: [] };
    return out;
  };

  /** A semantic action (R10) applied to the state; outside the map it does nothing. */
  const semantic = (s: GameState, a: SemanticAction): Partial<GameState> => {
    if (!selectMapActive(s)) return {};
    switch (a.type) {
      case "move": {
        const player = { ...s.player, heldDir: { x: a.dir.x, y: a.dir.y } };
        if (a.dir.x === 0 && a.dir.y === 0) return { player, ...(s.player.intent.kind === "dir" ? withIntent({ ...s, player }, IDLE) : {}) };
        // The yaw is the live camera one (D-820): before it was the preset's fixed one (presetAngles), constant.
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

  /** One fixed simulation step (30 Hz): moves the player and recomputes nearby interactables (core). */
  const simulate = (s: GameState): Partial<GameState> => {
    const { diorama } = s.world;
    const pos = s.player.position;
    if (!selectMapActive(s) || !diorama || !pos) return {};
    const v = s.player.velocity;
    // Still and with no intent: nothing changes and nobody is notified (the store does not notify 30 times per second).
    if (s.player.intent.kind === "idle" && v.x === 0 && v.z === 0 && s.player.previous === pos) return {};
    const { body, intent } = stepBody(diorama.grid, { x: pos.x, z: pos.z, vx: v.x, vz: v.z }, s.player.intent, s.player.running ? RUN_MOVEMENT : DEFAULT_MOVEMENT);
    // If it did not move, the same object is kept: so the next step sees previous === position and does not notify.
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
   * Recentering (D-820, AC25): walking forward (W without lateral) or toward a click, from 1.5 s after the
   * last look, the camera turns toward the direction of travel at most 90°/s; never with "reduce motion". Time without looking
   * is counted in simulation steps with movement (when still, the loop does not notify the store).
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

  /** Camera on entering a map: third-person by default, or the whole map if the setting is `perspective3D`. */
  const cameraFor = (settings: Settings, fitDistance: number): CameraState => {
    const overview = settings.camera === "perspective3D";
    const c = initialCamera(overview);
    return { ...c, fitDistance, zoomDistance: overview ? fitDistance : c.zoomDistance };
  };

  return {
    announce(key: string, params: Params = {}): void {
      set((s) => ({ ui: { ...s.ui, announcement: announcement(s, key, params) } }));
    },

    /** Restores settings saved on the device (or system preferences). No announcement. */
    restoreSettings(patch: SettingsPatch | null): void {
      set((s) => {
        const settings = applySettingsPatch(s.settings, patch);
        return { settings, ui: { ...s.ui, camera: cameraFor(settings, s.ui.camera.fitDistance) } };
      });
    },

    /** End of startup: tier suggested by capabilities, initial phase and main menu open. */
    bootCompleted(caps: Capabilities): void {
      set((s) => {
        const settings = applySettingsPatch(s.settings, { graphics: { suggestedTier: suggestTier(caps) } });
        const tier = effectiveTier(settings.graphics.tier, settings.graphics.suggestedTier);
        const key = !caps.webgl2 ? "announce.noWebgl" : tier === "dialog-only" ? "announce.dialogOnlyChosen" : "announce.ready";
        return {
          settings,
          session: { ...s.session, phase: phaseAfterBoot(tier) },
          // Without WebGL it lands directly in dialogue-only (§2.7.2.1); with WebGL, the main menu chooses.
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

    /** Closes the top panel and returns focus to whoever opened it. */
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

    /** Closes all panels and shows the current phase's view. */
    closeAllPanels(): void {
      set((s) => ({ ui: { ...s.ui, panels: [], returnFocus: [], focusRequest: null } }));
    },

    enterDialogOnly(): void {
      set((s) => ({
        session: { ...s.session, phase: "dialogOnly" },
        ui: { ...s.ui, panels: [], returnFocus: [], announcement: announcement(s, "announce.enteredDialogOnly") },
      }));
    },

    /**
     * To the map only if the tier allows it; otherwise it explains via aria-live and changes nothing. Open-world-3d T10 (d):
     * dispatched by the click on "Explore the map" (MainMenu); if it lets you in, it marks `lg:world-enter` (once per page).
     */
    enterWorld(): void {
      if (canEnterWorld(tierOf(get()))) markWorldEnter(globalThis.performance);
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

    /** Enter the scene with an NPC (or, with `null`, follow the story without an NPC: Lumi scenes like M0.2). */
    enterScene(npcId: string | null, openerId: string | null = null): void {
      set((s) => openScene(s, npcId, openerId));
    },

    /** Leave the dialogue HUD: the service closes the connection (the server aborts a scene in progress). */
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

    /** "Done" in text mode: sends what was written and closes the turn. Empty or out of turn sends nothing and says so. */
    submitTurn(text: string): void {
      set((s) => {
        const clean = text.trim();
        if (!canWrite(s.dialogue)) return { ui: { ...s.ui, announcement: announcement(s, "announce.notYourTurn") } };
        if (clean.length === 0) return { ui: { ...s.ui, announcement: announcement(s, "announce.emptyTurn") } };
        const body = clean.slice(0, MAX_TURN_CHARS);
        const d = enqueue(s.dialogue, { type: "turn.text", text: body });
        const line: DialogueLine = { id: `player-${d.outboxSeq}`, speaker: "player", kind: "player", text: body, template: null };
        // Until the server confirms, the turn stays closed on the client side (it is not sent twice).
        return { dialogue: { ...d, history: [...d.history, line], turnSubstate: "committed" } };
      });
    },

    /** "Pass the turn": opens the menu of the 4 options (03 §5.5.3). */
    passTurn(): void {
      set((s) => {
        if (s.dialogue.state !== "playerTurn" || (s.dialogue.turnSubstate !== "waiting" && s.dialogue.turnSubstate !== "endPending")) return {};
        return { dialogue: enqueue(s.dialogue, { type: "turn.pass" }) };
      });
    },

    /** One option of the pass menu. `repeat` also re-reads the NPC's last line via aria-live, at no cost. */
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

    /** Word outside the glossary (or without a visible translation): marked for review, no invented translation (D-068). */
    markForReview(word: string): void {
      set((s) => {
        const w = word.trim().toLowerCase();
        if (w === "") return {};
        const marked = s.learner.marked.includes(w) ? s.learner.marked : [...s.learner.marked, w];
        return { learner: { ...s.learner, marked }, ui: { ...s.ui, announcement: announcement(s, "announce.marked", { word: w }) } };
      });
    },

    setHintChip: (on: boolean) => changeSettings({ input: { hintChip: on } }, on ? "announce.hintChip.on" : "announce.hintChip.off"),

    // ---------- voice (F5.2): the UI asks, services/audio executes ----------

    /** "Speak": opens the spoken turn (voice.turnStart). Out of turn or with the NPC sounding, it does nothing and says so. */
    voiceTalkStart(): void {
      set((s) => {
        if (!canTalk(s.dialogue)) return s.dialogue.voice.talk === "idle" ? { ui: { ...s.ui, announcement: announcement(s, "announce.notYourTurn") } } : {};
        const d = enqueue(s.dialogue, { type: "voice.turnStart" });
        return { dialogue: withVoice(d, { talk: "talking", heard: null, turnHint: null }) };
      });
    },

    /** "Done" or releasing "Speak": the turn closes (services/audio sends the end after a short audio tail). */
    voiceTalkEnd(): void {
      set((s) => (s.dialogue.voice.talk === "talking" ? { dialogue: withVoice(s.dialogue, { talk: "ending" }) } : {}));
    },

    /**
     * services/audio finished sending the turn's audio: voice.turnEnd to the server. `heardSpeech`: the local VAD
     * detected voice (if not, the HUD suggests checking the microphone). With `send: false` the turn is discarded without sending the end
     * (the scene is no longer on your turn, e.g. because of the time cap).
     */
    voiceTurnClosed(heardSpeech: boolean, send = true): void {
      set((s) => {
        if (s.dialogue.voice.talk === "idle") return {};
        const d = send ? enqueue(s.dialogue, { type: "voice.turnEnd" }) : s.dialogue;
        return { dialogue: withVoice(d, { talk: "idle", turnHint: heardSpeech ? null : "silent" }) };
      });
    },

    /** services/audio reports its state, the microphone level, or why there is no microphone. */
    audioChanged(patch: Partial<Pick<VoiceUi, "audio" | "micProblem" | "level">>): void {
      set((s) => {
        const v = s.dialogue.voice;
        const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => patch[k] !== v[k]);
        return changed ? { dialogue: withVoice(s.dialogue, patch) } : {};
      });
    },

    // ---------- scene service (services/scene) ----------

    sceneConnecting(): void {
      set((s) => ({ dialogue: { ...s.dialogue, connection: "connecting" } }));
    },
    sceneConnected(): void {
      set((s) => ({ dialogue: { ...s.dialogue, connection: "open" } }));
    },
    /** Clear failure: without a scene server there is no dialogue; it is said in the HUD and via aria-live. */
    sceneConnectionFailed(): void {
      set((s) => ({ dialogue: { ...s.dialogue, connection: "error" }, ui: { ...s.ui, announcement: announcement(s, "announce.sceneOffline") } }));
    },
    sceneConnectionClosed(): void {
      set((s) => (s.dialogue.connection === "open" ? { dialogue: { ...s.dialogue, connection: "closed" } } : {}));
    },
    /** Commands already sent by the service (up to and including `seq`). */
    outboxSent(seq: number): void {
      set((s) => (s.dialogue.outbox.length === 0 ? {} : { dialogue: { ...s.dialogue, outbox: s.dialogue.outbox.filter((o) => o.seq > seq) } }));
    },
    /** A message from the scene server; `scene.effects` also changes the world (03 §6.4.8). */
    sceneMessage(msg: ServerMessage): void {
      set((s) => {
        const dialogue = reduceSceneMessage(s.dialogue, msg);
        const patch: Partial<GameState> = dialogue === s.dialogue ? {} : { dialogue };
        if (msg.type === "scene.effects") Object.assign(patch, withEffects(s, msg.effects));
        if (msg.type === "scene.end") {
          patch.ui = { ...s.ui, announcement: announcement(s, `announce.sceneEnd.${msg.outcome}`) };
          const progression = withCompletedNpc(s.progression, msg.outcome, s.dialogue.npcId);
          if (progression !== s.progression) patch.progression = progression;
        }
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
    /** Without a glossary the HUD continues: tapping a word only offers to mark it (a translation is never invented). */
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

    /** Clear failure: without content there is no list; it is said via aria-live (no invented data). */
    contentFailed(): void {
      set((s) => ({ world: { ...s.world, catalog: "error" }, ui: { ...s.ui, announcement: announcement(s, "announce.contentFailed") } }));
    },

    // ---------- map (F2) ----------
    dioramaLoading(): void {
      set((s) => ({ world: { ...s.world, dioramaStatus: "loading" } }));
    },

    /** The compiled layout enters the core (grid, layers, NPCs) and the player appears at the spawn. */
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
     * Hot reload (FD0, 03 §6.5.2): the recompiled content comes in. services/content only dispatches it with no open
     * scene (the change applies in the next scene). If the current diorama changed, the core re-derives the grid
     * and layers; the player stays where they are if still walkable; if not, moves to the nearest free cell (or to the
     * spawn if none is near). `ids`: the ones touched.
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
     * Mission effects the server emitted when closing a scene (`scene.effects`, F4.1, 03 §6.4.8): flags,
     * foundations and presentations, with the same core rule the server uses (a foundation never goes back;
     * repeating an effect changes nothing). The 3D world reflects them by reading the store.
     */
    sceneEffectsApplied(effects: readonly WorldEffect[]): void {
      set((s) => withEffects(s, effects));
    },

    /** The game's single input entry (R10): services/input and state/bridge.ts translate devices to this. */
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
     * Zoom to a given t (0 = 2.5 m, 1 = the whole map). Used by the performance probe (close, mid and full poses) and the
     * tests; the player uses the steps.
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
     * world/camera reports the whole-map distance (it changes with aspect and yaw). With the whole map the distance
     * follows it; otherwise the requested one never exceeds it (zooming out too far does not accumulate invisible steps).
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

    /** One fixed simulation step; called by the services/simulation loop. */
    simulationStep(): void {
      set(simulate);
    },

    /**
     * PerformanceMonitor (§2.7.2.2): lowers the suggestion one notch. Never with a manually pinned tier (the manual
     * choice wins) nor during a conversation (avoids visual jumps while talking).
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

    /** WebGL context loss (§2.7.2.4): to dialogue-only without losing anything, with a notice. */
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

/** true while the scene is still alive on the server (03 §3.5.1, active states). */
export const isSceneActive = (d: DialogueState): boolean => ACTIVE_STEPS.has(d.state);

/** The single store's actions. */
export const actions: GameActions = createActions(gameStore);
