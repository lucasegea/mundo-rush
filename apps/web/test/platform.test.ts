// Adaptador web de Platform (R15, F1.1b) con dobles del navegador: sin jsdom (D-016).
import { describe, expect, test, vi } from "vitest";
import { createWebPlatform, PlatformError, STORAGE_PREFIX, type WebPlatformEnv } from "../src/services/platform";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const memoryStorage = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

const fakeEnv = (over: Partial<WebPlatformEnv> = {}): WebPlatformEnv => {
  const store = memoryStorage();
  return {
    navigator: {},
    storage: () => store,
    document: { fullscreenElement: null, documentElement: {} },
    open: vi.fn(),
    ...over,
  };
};

const domError = (name: string): Error => Object.assign(new Error(name), { name });

describe("createWebPlatform", () => {
  test("es el adaptador web y no tiene actualizaciones", async () => {
    const p = createWebPlatform(fakeEnv());
    expect(p.kind).toBe("web");
    expect(await p.updates.check()).toEqual({ available: false });
  });

  describe("permisos de micrófono", () => {
    test("query usa la Permissions API", async () => {
      const env = fakeEnv({ navigator: { permissions: { query: () => Promise.resolve({ state: "granted" }) } } });
      expect(await createWebPlatform(env).permissions.query("microphone")).toBe("granted");
    });

    test("query sin API o con error cae a prompt/unsupported según haya getUserMedia", async () => {
      const media = { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) };
      expect(await createWebPlatform(fakeEnv()).permissions.query("microphone")).toBe("unsupported");
      expect(await createWebPlatform(fakeEnv({ navigator: { mediaDevices: media } })).permissions.query("microphone")).toBe("prompt");
      const throwing = { query: () => Promise.reject(new TypeError("no microphone")) };
      expect(await createWebPlatform(fakeEnv({ navigator: { permissions: throwing, mediaDevices: media } })).permissions.query("microphone")).toBe("prompt");
      const odd = { query: () => Promise.resolve({ state: "raro" }) };
      expect(await createWebPlatform(fakeEnv({ navigator: { permissions: odd } })).permissions.query("microphone")).toBe("unsupported");
    });

    test("request pide el micrófono, suelta las pistas y devuelve granted", async () => {
      const stop = vi.fn();
      const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [{ stop }, { stop }] }));
      const p = createWebPlatform(fakeEnv({ navigator: { mediaDevices: { getUserMedia } } }));
      expect(await p.permissions.request("microphone")).toBe("granted");
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(stop).toHaveBeenCalledTimes(2);
    });

    test("request: rechazo del usuario = denied; sin API = unsupported; otro error se propaga", async () => {
      const deny = { getUserMedia: () => Promise.reject(domError("NotAllowedError")) };
      expect(await createWebPlatform(fakeEnv({ navigator: { mediaDevices: deny } })).permissions.request("microphone")).toBe("denied");
      expect(await createWebPlatform(fakeEnv()).permissions.request("microphone")).toBe("unsupported");
      const broken = { getUserMedia: () => Promise.reject(domError("NotReadableError")) };
      await expect(createWebPlatform(fakeEnv({ navigator: { mediaDevices: broken } })).permissions.request("microphone")).rejects.toThrow("NotReadableError");
    });
  });

  describe("almacenamiento local", () => {
    test("get/set/remove con prefijo lg:", async () => {
      const store = memoryStorage();
      const p = createWebPlatform(fakeEnv({ storage: () => store }));
      expect(await p.storage.get("ajustes")).toBeNull();
      await p.storage.set("ajustes", "{}");
      expect(store.data.get(`${STORAGE_PREFIX}ajustes`)).toBe("{}");
      expect(await p.storage.get("ajustes")).toBe("{}");
      await p.storage.remove("ajustes");
      expect(store.data.size).toBe(0);
    });

    test("si el navegador bloquea el almacenamiento, falla con storage_unavailable (sin fallback silencioso)", async () => {
      const p = createWebPlatform(fakeEnv({ storage: () => { throw domError("SecurityError"); } }));
      await expect(p.storage.get("x")).rejects.toMatchObject({ code: "storage_unavailable" });
      await expect(p.storage.set("x", "1")).rejects.toBeInstanceOf(PlatformError);
      await expect(p.storage.remove("x")).rejects.toThrow(/SecurityError/);
    });
  });

  describe("enlaces", () => {
    test("abre http(s) en otra pestaña sin opener", async () => {
      const open = vi.fn();
      await createWebPlatform(fakeEnv({ open })).openLink("https://example.org/a");
      expect(open).toHaveBeenCalledWith("https://example.org/a", "_blank", "noopener,noreferrer");
    });

    test("rechaza esquemas que no son http(s) y textos que no son URL", async () => {
      const open = vi.fn();
      const p = createWebPlatform(fakeEnv({ open }));
      await expect(p.openLink("javascript:alert(1)")).rejects.toMatchObject({ code: "invalid_link" });
      await expect(p.openLink("no es url")).rejects.toMatchObject({ code: "invalid_link" });
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe("pantalla completa", () => {
    test("enter y exit llaman a la API del documento", async () => {
      const doc = {
        fullscreenElement: null as unknown,
        documentElement: { requestFullscreen: vi.fn(() => { doc.fullscreenElement = {}; return Promise.resolve(); }) },
        exitFullscreen: vi.fn(() => { doc.fullscreenElement = null; return Promise.resolve(); }),
      };
      const p = createWebPlatform(fakeEnv({ document: doc }));
      expect(p.fullscreen.isActive()).toBe(false);
      await p.fullscreen.enter();
      expect(p.fullscreen.isActive()).toBe(true);
      await p.fullscreen.exit();
      expect(p.fullscreen.isActive()).toBe(false);
      await p.fullscreen.exit();
      expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    });

    test("sin API falla con fullscreen_unavailable", async () => {
      const p = createWebPlatform(fakeEnv());
      await expect(p.fullscreen.enter()).rejects.toMatchObject({ code: "fullscreen_unavailable" });
      const active = createWebPlatform(fakeEnv({ document: { fullscreenElement: {}, documentElement: {} } }));
      await expect(active.fullscreen.exit()).rejects.toMatchObject({ code: "fullscreen_unavailable" });
    });
  });
});
