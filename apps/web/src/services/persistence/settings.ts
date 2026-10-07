// services/persistence — copia local de los ajustes (03 §3.3: "servidor + copia local"; la parte de servidor
// llega con F7). Pasa por la interfaz Platform (R15), nunca por localStorage directo. Lo que se lee se sanea
// con applySettingsPatch del núcleo (un guardado viejo o roto no rompe nada).
import { persistableSettings, type Settings, type SettingsPatch } from "@lg/core";
import type { Platform } from "../platform";

export const SETTINGS_KEY = "settings.v1";

/** Ajustes guardados en el dispositivo, o null si no hay, si están rotos o si el almacenamiento no anda. */
export async function loadSavedSettings(platform: Pick<Platform, "storage">): Promise<SettingsPatch | null> {
  let raw: string | null;
  try {
    raw = await platform.storage.get(SETTINGS_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as SettingsPatch) : null;
  } catch {
    return null;
  }
}

export interface SettingsSource {
  getSettings(): Settings;
  subscribeSettings(listener: (s: Settings) => void): () => void;
}

/**
 * Guarda los ajustes cada vez que cambian. Si el almacenamiento falla, avisa UNA vez (`onUnavailable`) y deja
 * de intentar: los ajustes siguen valiendo en memoria. Devuelve la función para desuscribirse.
 */
export function persistSettings(source: SettingsSource, platform: Pick<Platform, "storage">, onUnavailable: () => void): () => void {
  let failed = false;
  return source.subscribeSettings((settings) => {
    if (failed) return;
    platform.storage.set(SETTINGS_KEY, JSON.stringify(persistableSettings(settings))).catch(() => {
      failed = true;
      onUnavailable();
    });
  });
}
