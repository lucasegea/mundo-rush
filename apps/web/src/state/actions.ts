// state/actions.ts — barril de acciones públicas: lo único que ui/ (y dev/director) despachan (R14, P0 T2).
// Acciones delgadas: las reglas (tiers, saneo de ajustes, fase, pila de paneles) viven en @lg/core.
import {
  applySettingsPatch, canEnterWorld, cellAt, DEFAULT_MOVEMENT, downgradeTier, effectiveTier, facingFrom, IDLE,
  nearbyInteractables, phaseAfterBoot, planPath, popPanel, prepareDiorama, presetAngles, pushPanel, sameIds,
  screenDirToWorld, stepBody, stepZoom, suggestTier,
  type Capabilities, type DioramaLayout, type FeedbackMode, type MoveIntent, type NpcSpeed, type Panel,
  type SemanticAction, type SettingsPatch, type TextScale, type TierChoice,
} from "@lg/core";
import { gameStore, type GameState, type GameStore } from "./store";
import type { NpcInfo, PlaceInfo } from "./slices";
import { selectMapActive } from "./selectors/world";

export interface DialogOnlyCatalog {
  regionName: string;
  places: PlaceInfo[];
  npcs: NpcInfo[];
}

type Params = Record<string, string | number>;

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
    const panels = pushPanel(s.ui.panels, { kind: "scene", npcId: item.id });
    return {
      player: { ...s.player, intent: IDLE, path: [], velocity: { x: 0, z: 0 } },
      ui: { ...s.ui, panels, returnFocus: [...s.ui.returnFocus, null] },
    };
  };

  const zoom = (direction: 1 | -1) => (s: GameState): Partial<GameState> => {
    const zoomStep = stepZoom(s.ui.zoomStep, direction);
    return zoomStep === s.ui.zoomStep ? {} : { ui: { ...s.ui, zoomStep } };
  };

  /** Una acción semántica (R10) aplicada al estado; fuera del mapa no hace nada. */
  const semantic = (s: GameState, a: SemanticAction): Partial<GameState> => {
    if (!selectMapActive(s)) return {};
    switch (a.type) {
      case "move": {
        if (a.dir.x === 0 && a.dir.y === 0) return s.player.intent.kind === "dir" ? withIntent(s, IDLE) : {};
        const w = screenDirToWorld(a.dir, presetAngles(s.settings.camera).yawDeg);
        return withIntent(s, { kind: "dir", x: w.x, z: w.z });
      }
      case "moveTo": return walkTo(s, a.x, a.z);
      case "interact": return interactWith(s, a.target, false);
      case "talk": return interactWith(s, null, true);
      case "cancel": return withIntent(s, IDLE);
      case "openNotebook": return { ui: { ...s.ui, announcement: announcement(s, "announce.notebookSoon") } };
      case "zoomIn": return zoom(1)(s);
      case "zoomOut": return zoom(-1)(s);
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
    const { body, intent } = stepBody(diorama.grid, { x: pos.x, z: pos.z, vx: v.x, vz: v.z }, s.player.intent);
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
    };
  };

  return {
    announce(key: string, params: Params = {}): void {
      set((s) => ({ ui: { ...s.ui, announcement: announcement(s, key, params) } }));
    },

    /** Restaura ajustes guardados en el dispositivo (o preferencias del sistema). Sin anuncio. */
    restoreSettings(patch: SettingsPatch | null): void {
      set((s) => ({ settings: applySettingsPatch(s.settings, patch) }));
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

    /** Placeholder de "entrar a la escena": el diálogo real llega con F4. */
    enterScene(npcId: string, openerId: string | null = null): void {
      openPanel({ kind: "scene", npcId }, openerId);
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
        };
      });
    },

    dioramaFailed(): void {
      set((s) => ({ world: { ...s.world, dioramaStatus: "error" }, ui: { ...s.ui, announcement: announcement(s, "announce.mapFailed") } }));
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

/** Las acciones del store único. */
export const actions: GameActions = createActions(gameStore);
