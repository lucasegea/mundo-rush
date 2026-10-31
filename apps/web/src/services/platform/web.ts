// `web` adapter of Platform (R15): the only one for now. Browser APIs come in through
// WebPlatformEnv so it can be tested with doubles in vitest (no jsdom or browser, D-016).
import { PlatformError, type PermissionStatus, type Platform } from "./types";

interface MediaTrackLike {
  stop(): void;
}

/** The minimum of the browser the adapter uses. */
export interface WebPlatformEnv {
  navigator: {
    permissions?: { query(descriptor: { name: "microphone" }): Promise<{ state: string }> };
    mediaDevices?: { getUserMedia(constraints: { audio: true }): Promise<{ getTracks(): MediaTrackLike[] }> };
  };
  /** localStorage can throw on access (private mode, blocked cookies): hence it is a function. */
  storage(): Pick<Storage, "getItem" | "setItem" | "removeItem">;
  document: {
    readonly fullscreenElement: unknown;
    documentElement: { requestFullscreen?: () => Promise<void> };
    exitFullscreen?: () => Promise<void>;
  };
  open(url: string, target: string, features: string): unknown;
}

/** Prefix of the game's keys in browser storage. */
export const STORAGE_PREFIX = "lg:";

const PERMISSION_STATES: readonly string[] = ["granted", "denied", "prompt"];
const DENIED_ERRORS: readonly string[] = ["NotAllowedError", "SecurityError"];

/** The real browser environment (read on each call, never on module import). */
export function browserEnv(): WebPlatformEnv {
  return {
    navigator: navigator as unknown as WebPlatformEnv["navigator"],
    storage: () => window.localStorage,
    document,
    open: (url, target, features) => window.open(url, target, features),
  };
}

export function createWebPlatform(env: WebPlatformEnv = browserEnv()): Platform {
  const storage = <T>(action: string, fn: (s: ReturnType<WebPlatformEnv["storage"]>) => T): Promise<T> => {
    try {
      return Promise.resolve(fn(env.storage()));
    } catch (err) {
      const reason = err instanceof Error ? err.name : "desconocido";
      return Promise.reject(new PlatformError("storage_unavailable", `almacenamiento local no disponible (${action}: ${reason})`));
    }
  };

  const hasMicrophoneApi = (): boolean => typeof env.navigator.mediaDevices?.getUserMedia === "function";

  return {
    kind: "web",
    permissions: {
      async query(kind): Promise<PermissionStatus> {
        const fallback: PermissionStatus = hasMicrophoneApi() ? "prompt" : "unsupported";
        if (!env.navigator.permissions) return fallback;
        try {
          const { state } = await env.navigator.permissions.query({ name: kind });
          return PERMISSION_STATES.includes(state) ? (state as PermissionStatus) : fallback;
        } catch {
          // Some browsers do not recognize "microphone" in the Permissions API.
          return fallback;
        }
      },
      async request(): Promise<PermissionStatus> {
        const media = env.navigator.mediaDevices;
        if (!media || typeof media.getUserMedia !== "function") return "unsupported";
        try {
          const stream = await media.getUserMedia({ audio: true });
          // We only request the permission: the real capture is opened by services/audio/ when it needs it.
          for (const track of stream.getTracks()) track.stop();
          return "granted";
        } catch (err) {
          if (err instanceof Error && DENIED_ERRORS.includes(err.name)) return "denied";
          throw err;
        }
      },
    },
    storage: {
      get: (key) => storage("get", (s) => s.getItem(STORAGE_PREFIX + key)),
      set: (key, value) => storage("set", (s) => s.setItem(STORAGE_PREFIX + key, value)),
      remove: (key) => storage("remove", (s) => s.removeItem(STORAGE_PREFIX + key)),
    },
    updates: {
      // On the web the server always serves the current version: there is nothing to update.
      check: () => Promise.resolve({ available: false }),
    },
    openLink(url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return Promise.reject(new PlatformError("invalid_link", "enlace inválido"));
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return Promise.reject(new PlatformError("invalid_link", `esquema no permitido: ${parsed.protocol}`));
      }
      env.open(parsed.href, "_blank", "noopener,noreferrer");
      return Promise.resolve();
    },
    fullscreen: {
      isActive: () => env.document.fullscreenElement != null,
      async enter() {
        const request = env.document.documentElement.requestFullscreen;
        if (typeof request !== "function") {
          throw new PlatformError("fullscreen_unavailable", "pantalla completa no disponible");
        }
        await request.call(env.document.documentElement);
      },
      async exit() {
        if (env.document.fullscreenElement == null) return;
        const exit = env.document.exitFullscreen;
        if (typeof exit !== "function") {
          throw new PlatformError("fullscreen_unavailable", "pantalla completa no disponible");
        }
        await exit.call(env.document);
      },
    },
  };
}
