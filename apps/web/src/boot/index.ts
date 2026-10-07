// Raíz de composición: arranque de servicios (03 §4.2.1, P0 T1). Orden: ajustes guardados → capacidades y
// tier (R12) → guardado de ajustes → contenido de solo-diálogo → gancho de desarrollo (FD0).
// Todo entra por parámetros: los tests arrancan la app con un navegador simulado (sin WebGL, sin red).
import type { GameActions } from "../state/actions";
import type { GameStore } from "../state/store";
import { loadDialogOnlyCatalog, type FetchJson } from "../services/content";
import { loadSavedSettings, persistSettings } from "../services/persistence";
import type { Platform } from "../services/platform";
import { detectCapabilities, type QualityEnv } from "../services/quality";
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
  await runDevHook();
  return stopPersisting;
}
