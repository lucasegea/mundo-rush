// Raíz de composición: arranque de servicios (03 §4.2.1, P0 T1). Orden: ajustes guardados → capacidades y
// tier (R12) → guardado de ajustes → contenido de solo-diálogo → mapa (F2: input, lazo de simulación y carga
// del diorama al entrar a la fase `world`) → gancho de desarrollo (FD0).
// Todo entra por parámetros: los tests arrancan la app con un navegador simulado (sin WebGL, sin red).
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
  /** `prefers-reduced-motion` del sistema: el default de "reducir movimiento" si no hay ajustes guardados. */
  prefersReducedMotion: boolean;
  /** Base de la app (import.meta.env.BASE_URL). */
  baseUrl: string;
  /**
   * Universo a jugar (S4/D-806): el cliente pide el contenido compilado de ese namespace y entra a su diorama de
   * arranque. unset / U-CAMPESINO ⇒ el árbol legacy y el diorama de prueba, verbatim (sin regresión de la campesino).
   * En dev lo setea main.tsx desde `?universe=<id>`; el servidor usa el mismo id por LG_UNIVERSE.
   */
  universeId?: string;
  fetchJson?: FetchJson;
  /** Dispositivos y reloj del mapa (F2). Sin esto (tests del shell) no se escucha input ni corre la simulación. */
  world?: { inputTarget: EventTarget; scheduler?: FrameScheduler };
  /**
   * Servidor de escenas (F4.2). Sin esto (tests del shell) el HUD de diálogo abre pero no conecta. El servicio se
   * carga por import() diferido con la primera escena pedida (zod y el protocolo no entran al chunk inicial).
   */
  scene?: {
    connector: SceneConnector;
    /** F5.2: motor de audio (micrófono + voz del NPC). Sin esto, las escenas van por texto. */
    audio?: { createEngine: () => Promise<AudioEngine> };
  };
  /** Modo director (FD0): el canal de HMR para tests; en la app es import.meta.hot. */
  devHot?: DevHot;
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

  await loadDialogOnlyCatalog(actions, deps.baseUrl, deps.universeId, deps.fetchJson);

  // Diorama de arranque: la campesino entra al de prueba (verbatim); un universo generado entra al diorama de su
  // primer lugar (dato, no un mapa universo→diorama cableado), p. ej. U-GALEANO → el Cerro Rico de Potosí.
  const entryDiorama = (): string =>
    !deps.universeId || deps.universeId === UNIVERSO_DEFECTO
      ? WORLD_DIORAMA
      : store.getState().world.places[0]?.diorama ?? WORLD_DIORAMA;

  // El diorama se pide la primera vez que se entra al mapa (el modo solo-diálogo nunca lo descarga).
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
