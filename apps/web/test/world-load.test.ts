// Open-world-3d T10-code (T10 (d), D-835): la carga del mundo en lo puro. compileAsync antes del primer cuadro (nunca
// rechaza: un fallo o el tope dejan dibujar), el primer cuadro marca `lg:world-first-frame` solo después de
// `lg:world-enter` y registra `programs.length` una vez, y la precarga del menú quieto (chunk 3D y .glb de los árboles)
// corre una sola vez, solo con requestIdleCallback y solo con el menú arriba y el mapa disponible.
// T10-integrate: lo que llega tarde se precompila con `precompile` (destino del tier, nunca rechaza) y la precarga sale
// de una sola lista (WORLD_PRELOAD: chunk 3D, post, naturaleza, mapa, decodificadores).
import { DEFAULT_LOOK, natureModelFiles, publicUrl, rockFile, treeFile } from "@lg/art";
import { LOAD_MARKS, markWorldEnter, markWorldFirstFrame } from "@lg/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import appSource from "../src/App.tsx?raw";
import menuSource from "../src/ui/menus/MainMenu.tsx?raw";
import { actions } from "../src/state/actions";
import { gameStore, initialGameState } from "../src/state/store";
import gameCanvasSource from "../src/world/GameCanvas.tsx?raw";
import { DECODER_FILES, idlePreloader, naturePreloadUrls, PRELOAD_IDLE_TIMEOUT_MS, shouldPreloadWorld, WORLD_PRELOAD, worldPreloadTasks, type IdleEnv, type PreloadContext } from "../src/boot/preload";
import { fullscreenPasses, precompile, reportFirstFrame, resetFirstFrameLog, SHADER_WARMUP_TIMEOUT_MS, warmShaders, type LateCompiler, type WarmupTimers } from "../src/world/budget/loadWarmup";
import characterSource from "../src/world/actors/Character.tsx?raw";
import natureSource from "../src/world/nature/buildNature.ts?raw";
import postSource from "../src/world/post/Post.tsx?raw";

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

  test("los .glb de árboles y rocas con la url que pide buildNature (completo y liviano/lejano de cada uno)", () => {
    const urls = naturePreloadUrls("/");
    expect(urls).toHaveLength(new Set(natureModelFiles(DEFAULT_LOOK)).size);
    const first = DEFAULT_LOOK.vegetation.species[0];
    const rock = DEFAULT_LOOK.vegetation.rockScans[0];
    if (!first || !rock) throw new Error("DEFAULT_LOOK sin especies o sin rocas");
    expect(urls).toContain(publicUrl(treeFile(first, false)));
    expect(urls).toContain(publicUrl(treeFile(first, true)));
    expect(urls).toContain(publicUrl(rockFile(rock.scan, false)));
    expect(urls).toContain(publicUrl(rockFile(rock.scan, true)));
    expect(naturePreloadUrls("/juego/")[0]).toMatch(/^\/juego\/[^/]/);
    for (const u of urls) expect(u).toMatch(/\.glb$/);
  });

  test("App precarga el mismo import() que monta el canvas", () => {
    expect(appSource).toContain('const loadGameCanvas = () => import("./world/GameCanvas");');
    expect(appSource).toContain("const GameCanvas = lazy(loadGameCanvas);");
    expect(appSource.match(/import\("\.\/world\/GameCanvas"\)/g)).toHaveLength(1);
  });
});

// ---------- T10-integrate: lo que llega tarde se precompila al llegar; la precarga sale de una sola lista ----------

/** Un renderer de prueba: guarda el destino puesto en cada compilación y el orden de los cambios. */
const fakeRenderer = (result: () => Promise<unknown> = () => Promise.resolve()) => {
  const log: string[] = [];
  let target: string | null = null;
  const r: LateCompiler<string, string, string, string> & { log: string[] } = {
    log,
    getRenderTarget: () => target,
    setRenderTarget: (t) => {
      log.push(`destino ${t ?? "pantalla"}`);
      target = t;
    },
    compileAsync: (o, c, s) => {
      log.push(`compila ${o} con ${c} en ${s ?? "-"} hacia ${target ?? "pantalla"}`);
      return result();
    },
  };
  return r;
};

describe("precompile (lo que llega después de la primera escena)", () => {
  test("compila contra la escena del mundo con el destino pedido y devuelve el de antes enseguida", async () => {
    const r = fakeRenderer();
    const p = precompile(r, "cuerpo", "camara", "escena", "rt", 50, manualTimers());
    expect(r.log).toEqual(["destino rt", "compila cuerpo con camara en escena hacia rt", "destino pantalla"]);
    expect(r.getRenderTarget()).toBeNull();
    await expect(p).resolves.toBe("compiled");
  });

  test("sin postprocesado (destino pantalla) no toca el destino", async () => {
    const r = fakeRenderer();
    await expect(precompile(r, "rocas", "camara", "escena", null, 50, manualTimers())).resolves.toBe("compiled");
    expect(r.log).toEqual(["compila rocas con camara en escena hacia pantalla"]);
  });

  test("nunca rechaza: un fallo, una excepción o el tope dejan seguir; el destino vuelve igual", async () => {
    const bad = fakeRenderer(() => Promise.reject(new Error("x")));
    await expect(precompile(bad, "a", "c", "s", "rt", 50, manualTimers())).resolves.toBe("failed");
    const throws = fakeRenderer(() => { throw new Error("y"); });
    await expect(precompile(throws, "a", "c", "s", "rt", 50, manualTimers())).resolves.toBe("failed");
    expect(throws.getRenderTarget()).toBeNull();
    const timers = manualTimers();
    const p = precompile(fakeRenderer(() => new Promise(() => {})), "a", "c", "s", null, SHADER_WARMUP_TIMEOUT_MS, timers);
    timers.fire();
    await expect(p).resolves.toBe("timeout");
  });

  test("fullscreenPasses: las pasadas con material y las internas de sus efectos, sin repetir; la RenderPass no", () => {
    const pass = (scene: string, extra: object = {}) => ({ scene, camera: `cam-${scene}`, fullscreenMaterial: {}, ...extra });
    const luminance = pass("umbral");
    const blur = pass("desenfoque");
    const composer = {
      passes: [
        { scene: "mundo", camera: "cam", fullscreenMaterial: null }, // RenderPass: sin material propio
        pass("efectos", { renderToScreen: true, effects: [{ luminancePass: luminance, blurPass: blur, intensity: 1 }, { again: luminance }, null] }),
        pass("copia"),
      ],
    };
    expect(fullscreenPasses(composer)).toEqual([
      { scene: "efectos", camera: "cam-efectos", screen: true },
      { scene: "umbral", camera: "cam-umbral", screen: false },
      { scene: "desenfoque", camera: "cam-desenfoque", screen: false },
      { scene: "copia", camera: "cam-copia", screen: false },
    ]);
    expect(fullscreenPasses({ passes: [] })).toEqual([]);
  });

  test("los que llegan tarde la usan: cuerpos antes de cambiarse, naturaleza antes de mostrarse, pasadas del post", () => {
    // Character: el cuerpo con esqueleto se muestra recién cuando su compilación terminó.
    expect(characterSource).toMatch(/await precompile\(built\.root\);\s*if \(alive\) setSkinned\(built\);\s*else disposeSkinnedCharacter\(built\);/);
    // buildNature: precompila el grupo antes de `loaded = true` (el recorrido lo muestra recién ahí).
    expect(natureSource).toMatch(/if \(precompile\) await precompile\(group\);\s*if \(!alive\) return;\s*loaded = true;/);
    // Post: por prop, sin importar módulos del canvas (el chunk del post queda aparte).
    expect(postSource).not.toMatch(/from "\.\.\/budget\//);
    expect(gameCanvasSource).toContain("precompile={precompilePasses}");
    // El destino de la precompilación sigue al tier (render target con post).
    expect(gameCanvasSource).toContain('worldFrame.post = post !== "none";');
  });
});

describe("precarga: una sola lista de objetivos", () => {
  const ctx = (over: Partial<PreloadContext> = {}): PreloadContext & { fetched: string[]; chunks: string[] } => {
    const fetched: string[] = [];
    const chunks: string[] = [];
    return {
      fetched, chunks, baseUrl: "/", post: true,
      loadCanvas: () => { chunks.push("canvas"); return Promise.resolve(); },
      loadPost: () => { chunks.push("post"); return Promise.resolve(); },
      fetchUrl: (u) => { fetched.push(u); return Promise.resolve(); },
      ...over,
    };
  };

  test("los objetivos con nombre, en orden: chunk 3D, post, naturaleza, mapa y decodificadores", async () => {
    expect(WORLD_PRELOAD.map((t) => t.id)).toEqual(["chunk-3d", "chunk-post", "naturaleza", "mapa", "decodificadores"]);
    const c = ctx();
    await Promise.all(worldPreloadTasks(c).map((t) => t()));
    expect(c.chunks).toEqual(["canvas", "post"]);
    expect(c.fetched).toEqual([...naturePreloadUrls("/"), "/content/dioramas.json", ...DECODER_FILES.map((f) => `/decoders/${f}`)]);
  });

  test("sin postprocesado no baja su chunk (D-160); un universo pide sus datos del mapa", async () => {
    const c = ctx({ post: false, universeId: "U-GALEANO" });
    await Promise.all(worldPreloadTasks(c).map((t) => t()));
    expect(c.chunks).toEqual(["canvas"]);
    expect(c.fetched).toContain("/content/U-GALEANO/dioramas.json");
  });

  test("los decodificadores existen en public/decoders (un renombre no deja una precarga muerta)", () => {
    // Solo las rutas (glob sin cargar): lo que hay en public/decoders/.
    const onDisk = Object.keys(import.meta.glob("../public/decoders/*", { query: "?url" })).map((k) => k.split("/").pop());
    for (const f of DECODER_FILES) expect(onDisk, f).toContain(f);
  });

  test("la lista se arma en el momento quieto; si armarla tira, no se precarga y el menú sigue", () => {
    let idle: (() => void) | null = null;
    const env: IdleEnv = { requestIdleCallback: (cb: () => void) => { idle = cb; return 1; } };
    const task = vi.fn(() => Promise.resolve());
    const build = vi.fn(() => [task]);
    idlePreloader(build).schedule(env);
    expect(build).not.toHaveBeenCalled();
    (idle as unknown as () => void)();
    expect(build).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
    const broken = idlePreloader(() => { throw new Error("sin store"); });
    broken.schedule(env);
    expect(() => (idle as unknown as () => void)()).not.toThrow();
    expect(broken.started()).toBe(true);
  });

  test("App arma la lista con los mismos import() de los lazy()", () => {
    expect(appSource).toContain('const loadPost = () => import("./world/post/Post");');
    expect(appSource).toContain("idlePreloader(() => worldPreloadTasks({");
  });
});
