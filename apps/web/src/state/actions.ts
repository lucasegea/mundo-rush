// state/actions.ts — barril de acciones públicas: lo único que ui/ (y dev/director) despachan (R14, P0 T2).
// Acciones delgadas: las reglas (tiers, saneo de ajustes, fase, pila de paneles) viven en @lg/core.
import {
  applySettingsPatch, canEnterWorld, effectiveTier, phaseAfterBoot, popPanel, pushPanel, suggestTier,
  type Capabilities, type FeedbackMode, type NpcSpeed, type Panel, type SettingsPatch, type TextScale, type TierChoice,
} from "@lg/core";
import { gameStore, type GameState, type GameStore } from "./store";
import type { NpcInfo, PlaceInfo } from "./slices";

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
  };
}

export type GameActions = ReturnType<typeof createActions>;

/** Las acciones del store único. */
export const actions: GameActions = createActions(gameStore);
