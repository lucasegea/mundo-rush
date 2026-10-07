// Raíz de composición: arranque de servicios (03 §4.2.1, P0 T1). Orden: ajustes guardados → capacidades y
// tier (R12) → guardado de ajustes → contenido de solo-diálogo → mapa (F2: input, lazo de simulación y carga
// del diorama al entrar a la fase `world`) → gancho de desarrollo (FD0).
// Todo entra por parámetros: los tests arrancan la app con un navegador simulado (sin WebGL, sin red).
import type { GameActions } from "../state/actions";
import { selectMapActive } from "../state/selectors";
import type { GameStore } from "../state/store";
import { loadDialogOnlyCatalog, loadDiorama, type FetchJson } from "../services/content";
import { startInput } from "../services/input";
import { loadSavedSettings, persistSettings } from "../services/persistence";
import type { Platform } from "../services/platform";
import { detectCapabilities, type QualityEnv } from "../services/quality";
import { startSimulation, type FrameScheduler } from "../services/simulation";
import { runDevHook } from "./dev";

export interface BootDeps {
  store: GameStore;
  actions: GameActions;
  platform: Pick<Platform, "storage">;
  qualityEnv: QualityEnv;
  /** `prefers-reduced-motion` del sistema: el default de "reducir movimiento" si no hay ajustes guardados. */
  prefersReducedMotion: boolean;
  /** Base de la app (import.meta.env.BASE_URL). */
  baseUrl: string;
  fetchJson?: FetchJson;
  /** Dispositivos y reloj del mapa (F2). Sin esto (tests del shell) no se escucha input ni corre la simulación. */
  world?: { inputTarget: EventTarget; scheduler?: FrameScheduler };
}

/** Arranca la app. Devuelve una función que suelta las suscripciones (para tests). */
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

  await loadDialogOnlyCatalog(actions, deps.baseUrl, deps.fetchJson);

  // El diorama se pide la primera vez que se entra al mapa (el modo solo-diálogo nunca lo descarga).
  const playing = (): boolean => selectMapActive(store.getState());
  const stopMapLoad = store.subscribe((s) => s.session.phase, (phase) => {
    if (phase === "world" && store.getState().world.dioramaStatus === "idle") void loadDiorama(actions, deps.baseUrl, undefined, deps.fetchJson);
  }, { fireImmediately: true });
  const stops = [stopPersisting, stopMapLoad];
  if (deps.world) {
    stops.push(startInput({ target: deps.world.inputTarget, dispatch: actions.dispatch, isActive: playing }));
    stops.push(startSimulation({ step: actions.simulationStep, isActive: playing, ...(deps.world.scheduler ? { scheduler: deps.world.scheduler } : {}) }));
  }

  await runDevHook();
  return () => stops.forEach((stop) => stop());
}
