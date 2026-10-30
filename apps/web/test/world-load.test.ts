// Open-world-3d T10-code (T10 (d), D-835): la carga del mundo en lo puro. compileAsync antes del primer cuadro (nunca
// rechaza: un fallo o el tope dejan dibujar), el primer cuadro marca `lg:world-first-frame` solo después de
// `lg:world-enter` y registra `programs.length` una vez, y la precarga del menú quieto (chunk 3D y .glb de los árboles)
// corre una sola vez, solo con requestIdleCallback y solo con el menú arriba y el mapa disponible.
import { DEFAULT_LOOK, publicUrl, treeFile } from "@lg/art";
import { LOAD_MARKS, markWorldEnter, markWorldFirstFrame } from "@lg/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import appSource from "../src/App.tsx?raw";
import menuSource from "../src/ui/menus/MainMenu.tsx?raw";
import { actions } from "../src/state/actions";
import { gameStore, initialGameState } from "../src/state/store";
import gameCanvasSource from "../src/world/GameCanvas.tsx?raw";
import { idlePreloader, PRELOAD_IDLE_TIMEOUT_MS, shouldPreloadWorld, treePreloadUrls, type IdleEnv } from "../src/boot/preload";
import { reportFirstFrame, resetFirstFrameLog, SHADER_WARMUP_TIMEOUT_MS, warmShaders, type WarmupTimers } from "../src/world/budget/loadWarmup";

/** Una Performance de prueba: guarda las marcas en orden. */
const fakePerf = () => {
  const marks: { name: string; detail?: unknown }[] = [];
  return {
    marks,
    mark: (name: string, o?: { detail?: unknown }) => marks.push({ name, ...(o ? { detail: o.detail } : {}) }),
    getEntriesByName: (name: string) => marks.filter((m) => m.name === name),
  };
};

/** Timers manuales: `fire()` dispara el tope. */
const manualTimers = () => {
  let cb: (() => void) | null = null;
  const t: WarmupTimers & { fire(): void; cleared: number } = {
    cleared: 0,
    setTimeout: (f) => {
      cb = f;
      return 1;
    },
    clearTimeout: () => {
      t.cleared++;
    },
    fire: () => cb?.(),
  };
  return t;
};

describe("warmShaders", () => {
  test("compila con la escena y la cámara dadas y limpia el tope", async () => {
    const timers = manualTimers();
    const compileAsync = vi.fn(() => Promise.resolve());
    await expect(warmShaders({ compileAsync }, "escena", "camara", 50, timers)).resolves.toBe("compiled");
    expect(compileAsync).toHaveBeenCalledWith("escena", "camara");
    expect(timers.cleared).toBe(1);
  });

  test("un rechazo o una excepción no frenan el mundo", async () => {
    await expect(warmShaders({ compileAsync: () => Promise.reject(new Error("x")) }, 0, 0, 50, manualTimers())).resolves.toBe("failed");
    await expect(warmShaders({ compileAsync: () => { throw new Error("y"); } }, 0, 0, 50, manualTimers())).resolves.toBe("failed");
  });

  test("si compileAsync no termina, el tope deja dibujar", async () => {
    const timers = manualTimers();
    const p = warmShaders({ compileAsync: () => new Promise(() => {}) }, 0, 0, SHADER_WARMUP_TIMEOUT_MS, timers);
    timers.fire();
    await expect(p).resolves.toBe("timeout");
  });
});

describe("orden de las marcas (lg:world-enter antes de lg:world-first-frame)", () => {
  beforeEach(() => resetFirstFrameLog());

  test("sin entrada por el menú no hay marca de primer cuadro; con entrada, una sola y con los programas", () => {
    const perf = fakePerf();
    const log = vi.fn();
    // La marca real del puente (bridge.worldFirstFrame) es markWorldFirstFrame de @lg/core sobre `performance`.
    const mark = (programs: number): boolean => markWorldFirstFrame(perf, { programs });
    expect(reportFirstFrame(mark, 9, log)).toBe(false);
    expect(perf.marks).toEqual([]);
    expect(markWorldEnter(perf)).toBe(true);
    expect(reportFirstFrame(mark, 12, log)).toBe(true);
    expect(reportFirstFrame(mark, 13, log)).toBe(false);
    expect(perf.marks).toEqual([{ name: LOAD_MARKS.worldEnter }, { name: LOAD_MARKS.worldFirstFrame, detail: { programs: 12 } }]);
  });

  test("programs.length se registra una sola vez por página", () => {
    const log = vi.fn();
    reportFirstFrame(() => false, 7, log);
    reportFirstFrame(() => true, 8, log);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain("7 programas");
  });

  test("GameCanvas retiene el frameloop mientras compila la primera escena y marca después", () => {
    expect(gameCanvasSource).toContain("const warming = scene !== null && !warm;");
    expect(gameCanvasSource).toContain('frameloop={warming ? "never" : loop.frameloop}');
    expect(gameCanvasSource).toContain("{warming ? <ShaderWarmup onReady={onWarm} /> : null}");
    expect(gameCanvasSource).toContain("{scene && warm ? <FirstFrameMark /> : null}");
  });
});

describe("lg:world-enter sale del clic (enterWorld) y solo si el mapa deja entrar", () => {
  afterEach(() => {
    performance.clearMarks();
    gameStore.setState(initialGameState());
  });

  test("dialog-only no marca; con un tier que dibuja, una marca aunque se entre dos veces", () => {
    performance.clearMarks();
    const suggest = (suggestedTier: "dialog-only" | "medium"): void =>
      gameStore.setState((st) => ({ settings: { ...st.settings, graphics: { ...st.settings.graphics, tier: "auto", suggestedTier } } }));
    suggest("dialog-only");
    actions.enterWorld();
    expect(performance.getEntriesByName(LOAD_MARKS.worldEnter)).toHaveLength(0);
    suggest("medium");
    actions.enterWorld();
    actions.enterWorld();
    expect(performance.getEntriesByName(LOAD_MARKS.worldEnter)).toHaveLength(1);
    expect(menuSource).toContain("onClick={() => actions.enterWorld()}");
  });
});

describe("precarga con el menú quieto", () => {
  test("disparo: menú arriba, mapa disponible y fuera del mundo", () => {
    expect(shouldPreloadWorld({ phase: "boot", menuOpen: true, worldAvailable: true })).toBe(true);
    expect(shouldPreloadWorld({ phase: "boot", menuOpen: true, worldAvailable: false })).toBe(false);
    expect(shouldPreloadWorld({ phase: "boot", menuOpen: false, worldAvailable: true })).toBe(false);
    expect(shouldPreloadWorld({ phase: "world", menuOpen: true, worldAvailable: true })).toBe(false);
  });

  test("corre las tareas una sola vez en el requestIdleCallback, con su tope, y traga sus errores", async () => {
    let idle: (() => void) | null = null;
    const env: IdleEnv = { requestIdleCallback: vi.fn((cb: () => void) => { idle = cb; return 3; }), cancelIdleCallback: vi.fn() };
    const chunk = vi.fn(() => Promise.resolve());
    const broken = vi.fn(() => Promise.reject(new Error("404")));
    const throws = vi.fn((): Promise<unknown> => { throw new Error("sync"); });
    const pre = idlePreloader([throws, broken, chunk]);
    pre.schedule(env);
    expect(env.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: PRELOAD_IDLE_TIMEOUT_MS });
    expect(chunk).not.toHaveBeenCalled();
    (idle as unknown as () => void)();
    await Promise.resolve();
    expect([throws, broken, chunk].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(pre.started()).toBe(true);
    pre.schedule(env)();
    expect(env.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(env.cancelIdleCallback).not.toHaveBeenCalled();
  });

  test("cancelar antes de que corra; sin requestIdleCallback no se precarga", () => {
    const env: IdleEnv = { requestIdleCallback: () => 5, cancelIdleCallback: vi.fn() };
    const task = vi.fn(() => Promise.resolve());
    idlePreloader([task]).schedule(env)();
    expect(env.cancelIdleCallback).toHaveBeenCalledWith(5);
    const none = idlePreloader([task]);
    none.schedule({});
    expect(none.started()).toBe(false);
    expect(task).not.toHaveBeenCalled();
  });

  test("los .glb de los árboles con la url que pide buildNature (completo y liviano por especie)", () => {
    const urls = treePreloadUrls("/");
    expect(urls).toHaveLength(DEFAULT_LOOK.vegetation.species.length * 2);
    const first = DEFAULT_LOOK.vegetation.species[0];
    if (!first) throw new Error("DEFAULT_LOOK sin especies");
    expect(urls).toContain(publicUrl(treeFile(first, false)));
    expect(urls).toContain(publicUrl(treeFile(first, true)));
    expect(treePreloadUrls("/juego/")[0]).toMatch(/^\/juego\/[^/]/);
    for (const u of urls) expect(u).toMatch(/\.glb$/);
  });

  test("App precarga el mismo import() que monta el canvas", () => {
    expect(appSource).toContain('const loadGameCanvas = () => import("./world/GameCanvas");');
    expect(appSource).toContain("const GameCanvas = lazy(loadGameCanvas);");
    expect(appSource.match(/import\("\.\/world\/GameCanvas"\)/g)).toHaveLength(1);
  });
});
