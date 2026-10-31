// Composition root: service startup (03 §4.2.1, P0 T1). Order: saved settings → capabilities and
// tier (R12) → settings save → dialog-only content → map (F2: input, simulation loop and diorama
// load on entering the `world` phase) → development hook (FD0).
// Everything comes in through parameters: tests start the app with a simulated browser (no WebGL, no network).
import type { GameActions } from "../state/actions";
import { selectMapActive } from "../state/selectors";
import type { GameStore } from "../state/store";
import { loadDialogOnlyCatalog, loadDiorama, UNIVERSO_DEFECTO, WORLD_DIORAMA, type FetchJson } from "../services/content";
import { startInput } from "../services/input";
import { loadSavedSettings, persistSettings } from "../services/persistence";
import type { Platform } from "../services/platform";
import { detectCapabilities, type QualityEnv } from "../services/quality";
import { startSimulation, type FrameScheduler } from "../services/simulation";
import type { SceneConnector } from "../services/scene";
import type { AudioEngine } from "../services/audio";
import { runDevHook, type DevHot } from "./dev";

export interface BootDeps {
  store: GameStore;
  actions: GameActions;
  platform: Pick<Platform, "storage">;
  qualityEnv: QualityEnv;
  /** The system's `prefers-reduced-motion`: the default for "reduce motion" if there are no saved settings. */
  prefersReducedMotion: boolean;
  /** App base (import.meta.env.BASE_URL). */
  baseUrl: string;
  /**
 * Universe to play (S4/D-806): the client asks for that namespace's compiled content and enters its starting
 * diorama. unset / U-CAMPESINO ⇒ the legacy tree and the test diorama, verbatim (no regression for the farmer universe).
 * In dev main.tsx sets it from `?universe=<id>`; the server uses the same id through LG_UNIVERSE.
   */
  universeId?: string;
  fetchJson?: FetchJson;
  /** Map devices and clock (F2). Without this (shell tests) no input is listened to and the simulation does not run. */
  world?: { inputTarget: EventTarget; scheduler?: FrameScheduler };
  /**
 * Scene server (F4.2). Without this (shell tests) the dialogue HUD opens but does not connect. The service is
 * loaded by deferred import() with the first requested scene (zod and the protocol do not enter the initial chunk).
   */
  scene?: {
    connector: SceneConnector;
    /** F5.2: audio engine (microphone + NPC voice). Without this, scenes go by text. */
    audio?: { createEngine: () => Promise<AudioEngine> };
  };
  /** Director mode (FD0): the HMR channel for tests; in the app it is import.meta.hot. */
  devHot?: DevHot;
}

/** Starts the app. Returns a function that releases the subscriptions (for tests). */
export async function boot(deps: BootDeps): Promise<() => void> {
  const { store, actions, platform } = deps;
  const saved = await loadSavedSettings(platform);
  actions.restoreSettings(saved ?? { accessibility: { reduceMotion: deps.prefersReducedMotion } });
  actions.bootCompleted(detectCapabilities(deps.qualityEnv));

  const stopPersisting = persistSettings(
    {
      getSettings: () => store.getState().settings,
      subscribeSettings: (listener) => store.subscribe((s) => s.settings, listener),
    },
    platform,
    () => actions.announce("announce.storageUnavailable"),
  );

  await loadDialogOnlyCatalog(actions, deps.baseUrl, deps.universeId, deps.fetchJson);

  // Starting diorama: the farmer universe enters the test one (verbatim); a generated universe enters the diorama of its
  // first place (data, not a wired universe→diorama map), e.g. U-GALEANO → Cerro Rico de Potosí.
  const entryDiorama = (): string =>
    !deps.universeId || deps.universeId === UNIVERSO_DEFECTO
      ? WORLD_DIORAMA
      : store.getState().world.places[0]?.diorama ?? WORLD_DIORAMA;

  // The diorama is requested the first time the map is entered (dialog-only mode never downloads it).
  const playing = (): boolean => selectMapActive(store.getState());
  const stopMapLoad = store.subscribe((s) => s.session.phase, (phase) => {
    if (phase === "world" && store.getState().world.dioramaStatus === "idle") void loadDiorama(actions, deps.baseUrl, entryDiorama(), deps.universeId, deps.fetchJson);
  }, { fireImmediately: true });
  const stops = [stopPersisting, stopMapLoad];
  if (deps.world) {
    stops.push(startInput({ target: deps.world.inputTarget, dispatch: actions.dispatch, isActive: playing }));
    stops.push(startSimulation({ step: actions.simulationStep, isActive: playing, ...(deps.world.scheduler ? { scheduler: deps.world.scheduler } : {}) }));
  }

  if (deps.scene) {
    const { connector, audio } = deps.scene;
    let stopScene: (() => void) | null = null;
    let cancelled = false;
    const stopSceneLoad = store.subscribe((s) => s.dialogue.request !== null, (requested) => {
      if (!requested || stopScene) return;
      stopSceneLoad();
      void import("../services/scene").then(({ startSceneService }) => {
        if (cancelled) return;
        stopScene = startSceneService({
          store, actions, connector, baseUrl: deps.baseUrl,
          ...(deps.fetchJson ? { fetchJson: deps.fetchJson } : {}), ...(deps.universeId ? { universeId: deps.universeId } : {}), ...(audio ? { audio } : {}),
        });
      });
    }, { fireImmediately: true });
    stops.push(() => { cancelled = true; stopSceneLoad(); stopScene?.(); });
  }

  const stopDev = await runDevHook({
    store, actions, baseUrl: deps.baseUrl,
    ...(deps.fetchJson ? { fetchJson: deps.fetchJson } : {}),
    ...(deps.devHot ? { hot: deps.devHot } : {}),
    ...(deps.world ? { pageEvents: deps.world.inputTarget } : {}),
  });
  if (stopDev) stops.push(stopDev);
  return () => stops.forEach((stop) => stop());
}
