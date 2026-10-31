// services/persistence — local copy of the settings (03 §3.3: "server + local copy"; the server part
// arrives with F7). Goes through the Platform interface (R15), never through localStorage directly. What is read is sanitized
// with the core's applySettingsPatch (an old or broken save breaks nothing).
import { persistableSettings, type Settings, type SettingsPatch } from "@lg/core";
import type { Platform } from "../platform";

export const SETTINGS_KEY = "settings.v1";

/** Settings saved on the device, or null if there are none, they are broken or storage does not work. */
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
 * Saves the settings every time they change. If storage fails, it warns ONCE (`onUnavailable`) and stops
 * trying: the settings remain valid in memory. Returns the function to unsubscribe.
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
